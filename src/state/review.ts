import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import type { ReviewComment } from "../types";

const MAX_SNIPPET_LINES = 40;

/** En-dash range, e.g. "153–155" (or just "153" for a single line). */
function formatRange(start: number, end: number): string {
  return start === end ? `${start}` : `${start}–${end}`;
}

/** Truncate a captured snippet to a sane line count for the prompt. */
export function truncateSnippet(snippet: string): string {
  const lines = snippet.split("\n");
  if (lines.length <= MAX_SNIPPET_LINES) return snippet;
  const kept = lines.slice(0, MAX_SNIPPET_LINES);
  const more = lines.length - MAX_SNIPPET_LINES;
  return `${kept.join("\n")}\n… (${more} more lines)`;
}

/**
 * Build a markdown review prompt grouped by file. The wrapper is intentionally
 * neutral — the user's note governs whether something is a fix or a question.
 * Within a file, file-level notes come first, then line-anchored comments
 * sorted by starting line.
 */
export function buildClaudePrompt(comments: ReviewComment[]): string {
  const byFile = new Map<string, ReviewComment[]>();
  for (const c of comments) {
    const bucket = byFile.get(c.file);
    if (bucket) bucket.push(c);
    else byFile.set(c.file, [c]);
  }

  const parts: string[] = [
    "Address these review comments on the current changes:",
    "",
  ];

  for (const [file, fileComments] of byFile) {
    const sorted = fileComments.slice().sort((a, b) => {
      if (!a.range && b.range) return -1;
      if (a.range && !b.range) return 1;
      if (!a.range && !b.range) return a.createdAt - b.createdAt;
      return a.range!.start - b.range!.start;
    });
    for (const c of sorted) {
      if (!c.range) {
        parts.push(`### ${file} (file-level)`);
        parts.push(`> ${c.body.replace(/\n/g, "\n> ")}`);
        parts.push("");
        continue;
      }
      const side = c.range.side === "old" ? "old" : "new";
      parts.push(
        `### ${file}:${formatRange(c.range.start, c.range.end)} (${side})`,
      );
      const snippet = truncateSnippet(c.snippet ?? "");
      if (snippet) {
        for (const line of snippet.split("\n")) {
          parts.push(`      ${line}`);
        }
      }
      parts.push(`> ${c.body.replace(/\n/g, "\n> ")}`);
      parts.push("");
    }
  }

  return parts.join("\n").trimEnd() + "\n";
}

export async function writeReviewFile(
  repoPath: string,
  content: string,
): Promise<string> {
  return invoke<string>("write_review_file", { repoPath, content });
}

/**
 * Export all comments: copy the prompt to the clipboard AND write
 * `<repo-root>/.differ/review.md`. Returns the absolute path written.
 */
export async function exportForClaude(
  repoPath: string,
  comments: ReviewComment[],
): Promise<string> {
  const prompt = buildClaudePrompt(comments);
  await writeText(prompt);
  return writeReviewFile(repoPath, prompt);
}

export async function setupClaudeCommand(): Promise<string> {
  return invoke<string>("setup_claude_command");
}

export async function claudeCommandStatus(): Promise<boolean> {
  return invoke<boolean>("claude_command_status");
}
