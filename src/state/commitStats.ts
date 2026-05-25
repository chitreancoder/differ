/**
 * Shared cache for per-commit name-status results, plus their derived
 * summary stats (file count, +/-, top three files). Two unrelated consumers
 * hit the same backend command:
 *
 *   1. `useDiffFiles` (state/diff.ts) when `selectedCommit` is set —
 *      it needs the raw FileEntry list to populate the tree.
 *   2. The hover tooltip in CommitTimeline — it needs the derived stats
 *      to render the popover body.
 *
 * Before this module those were two independent fetches per commit (with
 * separate caches). Now `useDiffFiles` populates the cache as a side
 * effect; the tooltip reads from it for free.
 *
 * SHAs are immutable, so a (repo, sha, whitespace-mode) tuple is safe to
 * memoize for the life of the session. Cache is cleared from
 * state/refresh.ts when the user explicitly refreshes.
 */
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

/** Read the cached stats for a commit. Returns null on miss. */
export function peekCommitStats(
  repoPath: string,
  sha: string,
  ignoreWhitespace: boolean,
): CommitStats | null {
  return cache.get(key(repoPath, sha, ignoreWhitespace))?.stats ?? null;
}

/**
 * Store a (files, derived stats) result in the cache. Called by
 * `useDiffFiles` after a successful `diff_commit_name_status` fetch so the
 * tooltip can read its derived view without re-fetching.
 */
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

/**
 * Fetch (or read from cache) the stats for a single commit. Used by the
 * hover tooltip — `useDiffFiles` populates the same cache so on a cache
 * hit this resolves synchronously.
 */
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

/** Drop everything — called from state/refresh.ts on user-initiated refresh. */
export function clearCommitStatsCache(): void {
  cache.clear();
}
