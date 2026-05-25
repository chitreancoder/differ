/**
 * Per-repo selection helpers — a single place that knows how to read out the
 * (base, compare, selectedCommit) tuple for a repo and turn it into the
 * canonical "review scope" string we key comments and reviewed-marks on.
 *
 * Keep buildScope pure (no React, no store) so non-component code (Tauri
 * commands, export logic, tests) can build the same key the UI does.
 */
import { useStore } from "@/state/store";

/**
 * A review scope is the (repo, branches, optional commit) tuple identifying
 * the set of changes a reviewer is looking at. Branded so an arbitrary
 * string can't be passed where a scope is expected.
 */
export type ReviewScope = string & { readonly __brand: "ReviewScope" };

const EMPTY_COMMIT = "";

/**
 * Canonical scope key. `selectedCommit` is folded in so reviewing a single
 * commit in a branch range doesn't collide with the cumulative branch view.
 */
export function buildScope(
  repoPath: string,
  base: string,
  compare: string,
  selectedCommit?: string | null,
): ReviewScope {
  return `${repoPath}|${base}|${compare}|${selectedCommit ?? EMPTY_COMMIT}` as ReviewScope;
}

export type RepoSelection = {
  base: string | null;
  compare: string | null;
  selectedCommit: string | null;
  scope: ReviewScope | null;
};

/**
 * Read the active selection for a repo. Selectors are independent so each
 * useStore subscription stays cheap and returns stable references when the
 * underlying value didn't change.
 */
export function useRepoSelection(repoPath: string | null): RepoSelection {
  const base = useStore((s) =>
    repoPath ? s.base[repoPath] ?? null : null,
  );
  const compare = useStore((s) =>
    repoPath ? s.compare[repoPath] ?? null : null,
  );
  const selectedCommit = useStore((s) =>
    repoPath ? s.selectedCommit[repoPath] ?? null : null,
  );
  const scope =
    repoPath && base && compare
      ? buildScope(repoPath, base, compare, selectedCommit)
      : null;
  return { base, compare, selectedCommit, scope };
}
