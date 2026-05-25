/** Shared cache for per-commit name-status results + their derived stats.
 *  `useDiffFiles` populates it after a single-commit fetch so the
 *  CommitTimeline hover tooltip resolves from cache for free. */
import { invoke } from "@tauri-apps/api/core";
import type { FileEntry } from "@/types";

export type CommitStats = {
  fileCount: number;
  additions: number;
  deletions: number;
  topFiles: { path: string; additions: number; deletions: number }[];
};

type Entry = {
  files: FileEntry[];
  stats: CommitStats;
};

const cache = new Map<string, Entry>();

function key(repoPath: string, sha: string, ignoreWhitespace: boolean): string {
  return `${repoPath}|${sha}|${ignoreWhitespace ? 1 : 0}`;
}

function deriveStats(files: FileEntry[]): CommitStats {
  let additions = 0;
  let deletions = 0;
  for (const f of files) {
    additions += f.additions;
    deletions += f.deletions;
  }
  const topFiles = files
    .filter((f) => !f.isBinary)
    .slice()
    .sort(
      (a, b) =>
        b.additions + b.deletions - (a.additions + a.deletions),
    )
    .slice(0, 3)
    .map((f) => ({
      path: f.path,
      additions: f.additions,
      deletions: f.deletions,
    }));
  return { fileCount: files.length, additions, deletions, topFiles };
}

export function peekCommitStats(
  repoPath: string,
  sha: string,
  ignoreWhitespace: boolean,
): CommitStats | null {
  return cache.get(key(repoPath, sha, ignoreWhitespace))?.stats ?? null;
}

/** Side-channel writer used by useDiffFiles after a single-commit fetch. */
export function rememberCommitFiles(
  repoPath: string,
  sha: string,
  ignoreWhitespace: boolean,
  files: FileEntry[],
): void {
  cache.set(key(repoPath, sha, ignoreWhitespace), {
    files,
    stats: deriveStats(files),
  });
}

export async function fetchCommitStats(
  repoPath: string,
  sha: string,
  ignoreWhitespace: boolean,
): Promise<CommitStats> {
  const cached = peekCommitStats(repoPath, sha, ignoreWhitespace);
  if (cached) return cached;
  const files = await invoke<FileEntry[]>("diff_commit_name_status", {
    path: repoPath,
    sha,
    ignoreWhitespace,
  });
  rememberCommitFiles(repoPath, sha, ignoreWhitespace, files);
  return deriveStats(files);
}

export function clearCommitStatsCache(): void {
  cache.clear();
}
