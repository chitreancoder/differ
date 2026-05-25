/** Per-repo selection helpers — the canonical scope-key builder + a hook
 *  that destructures (base, compare, selectedCommit, scope) for one repo.
 *  `buildScope` is pure so non-React code can build the same key. */
import { useStore } from "@/state/store";

/** Branded so an arbitrary string can't be passed where a scope is expected. */
export type ReviewScope = string & { readonly __brand: "ReviewScope" };

export function buildScope(
  repoPath: string,
  base: string,
  compare: string,
  selectedCommit?: string | null,
): ReviewScope {
  return `${repoPath}|${base}|${compare}|${selectedCommit ?? ""}` as ReviewScope;
}

export type RepoSelection = {
  base: string | null;
  compare: string | null;
  selectedCommit: string | null;
  scope: ReviewScope | null;
};

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
