/** Hydration + serialization for the durable subset of the Zustand store.
 *  Transient fields (`reviewed`, modals, search query) are not persisted. */
import { Store } from "@tauri-apps/plugin-store";
import { invoke } from "@tauri-apps/api/core";
import type { DiffStyle, Repo, ReviewComment, ThemePreference } from "@/types";
import { useStore } from "@/state/store";

const STORE_FILE = "differ.json";
let storePromise: Promise<Store> | null = null;

function getStore(): Promise<Store> {
  if (!storePromise) storePromise = Store.load(STORE_FILE);
  return storePromise;
}

type Persisted = {
  repos: Repo[];
  activeRepoPath: string | null;
  sidebarCollapsed: boolean;
  treeWidth: number;
  diffStyle: DiffStyle;
  base: Record<string, string>;
  compare: Record<string, string>;
  commentMode: boolean;
  comments: Record<string, ReviewComment[]>;
  themePreference: ThemePreference;
  ignoreWhitespace: boolean;
};

export async function loadPersisted(): Promise<void> {
  const store = await getStore();

  const repos = ((await store.get<Repo[]>("repos")) ?? []).map((r) => ({
    ...r,
    missing: false,
  }));
  const activeRepoPath = (await store.get<string | null>("activeRepoPath")) ?? null;
  const sidebarCollapsed = (await store.get<boolean>("sidebarCollapsed")) ?? false;
  const treeWidth = (await store.get<number>("treeWidth")) ?? 280;
  const diffStyle = (await store.get<DiffStyle>("diffStyle")) ?? "split";
  const base = (await store.get<Record<string, string>>("base")) ?? {};
  const compare = (await store.get<Record<string, string>>("compare")) ?? {};
  const commentMode = (await store.get<boolean>("commentMode")) ?? false;
  const comments =
    (await store.get<Record<string, ReviewComment[]>>("comments")) ?? {};
  const themePreference =
    (await store.get<ThemePreference>("themePreference")) ?? "system";
  const ignoreWhitespace =
    (await store.get<boolean>("ignoreWhitespace")) ?? false;

  // Validate each repo silently in parallel; mark missing if open fails.
  await Promise.all(
    repos.map(async (r) => {
      try {
        const fresh = await invoke<Repo>("validate_repo", { path: r.path });
        Object.assign(r, fresh, { missing: false });
      } catch {
        r.missing = true;
      }
    }),
  );

  // Cross-check each opened repo's persisted base/compare against the live
  // ref set — a branch deleted between sessions otherwise surfaces as a
  // confusing "Diff failed" toast much later.
  const staleByRepo = new Map<string, string[]>();
  const migratedBaseByRepo = new Map<string, { from: string; to: string }>();
  await Promise.all(
    repos
      .filter((r) => !r.missing)
      .map(async (r) => {
        const b = base[r.path];
        const c = compare[r.path];
        if (!b && !c) return;
        try {
          const result = await invoke<{
            baseValid: boolean | null;
            compareValid: boolean | null;
            commitValid: boolean | null;
            baseUpstream: string | null;
          }>("validate_refs", {
            path: r.path,
            base: b ?? null,
            compare: c ?? null,
            commit: null,
          });
          const stale: string[] = [];
          if (b && result.baseValid === false) {
            stale.push(b);
            delete base[r.path];
          } else if (b && result.baseUpstream) {
            // Local base has an upstream → swap to it so the cumulative diff
            // matches what the remote PR view shows. Without this, a stale
            // local `main` produces wildly different file counts.
            base[r.path] = result.baseUpstream;
            migratedBaseByRepo.set(r.name, {
              from: b,
              to: result.baseUpstream,
            });
          }
          if (c && result.compareValid === false) {
            stale.push(c);
            delete compare[r.path];
          }
          if (stale.length) staleByRepo.set(r.name, stale);
        } catch {
          /* let the downstream diff path produce its own error. */
        }
      }),
  );

  useStore.getState().hydrate({
    repos,
    activeRepoPath: repos.some((r) => r.path === activeRepoPath)
      ? activeRepoPath
      : (repos[0]?.path ?? null),
    sidebarCollapsed,
    treeWidth,
    diffStyle,
    base,
    compare,
    commentMode,
    comments,
    themePreference,
    ignoreWhitespace,
  });

  for (const [repoName, stale] of staleByRepo) {
    const list = stale.map((n) => `'${n}'`).join(", ");
    const noun = stale.length === 1 ? "Branch" : "Branches";
    useStore
      .getState()
      .pushToast(`${noun} ${list} no longer exist in ${repoName}`, "info");
  }
  for (const [repoName, { from, to }] of migratedBaseByRepo) {
    useStore
      .getState()
      .pushToast(`Base switched from '${from}' to '${to}' in ${repoName}`, "info");
  }
}

export function startPersistSubscription(): () => void {
  let saveScheduled = false;
  let pendingState: Persisted | null = null;

  const flush = async () => {
    saveScheduled = false;
    if (!pendingState) return;
    const state = pendingState;
    pendingState = null;
    const store = await getStore();
    // Strip transient fields like `missing` before writing.
    const cleanRepos = state.repos.map(({ missing: _m, ...rest }) => rest);
    await store.set("repos", cleanRepos);
    await store.set("activeRepoPath", state.activeRepoPath);
    await store.set("sidebarCollapsed", state.sidebarCollapsed);
    await store.set("treeWidth", state.treeWidth);
    await store.set("diffStyle", state.diffStyle);
    await store.set("base", state.base);
    await store.set("compare", state.compare);
    await store.set("commentMode", state.commentMode);
    await store.set("comments", state.comments);
    await store.set("themePreference", state.themePreference);
    await store.set("ignoreWhitespace", state.ignoreWhitespace);
    await store.save();
  };

  return useStore.subscribe((s, prev) => {
    if (!s.hydrated) return;
    const relevantChanged =
      s.repos !== prev.repos ||
      s.activeRepoPath !== prev.activeRepoPath ||
      s.sidebarCollapsed !== prev.sidebarCollapsed ||
      s.treeWidth !== prev.treeWidth ||
      s.diffStyle !== prev.diffStyle ||
      s.base !== prev.base ||
      s.compare !== prev.compare ||
      s.commentMode !== prev.commentMode ||
      s.comments !== prev.comments ||
      s.themePreference !== prev.themePreference ||
      s.ignoreWhitespace !== prev.ignoreWhitespace;
    if (!relevantChanged) return;
    pendingState = {
      repos: s.repos,
      activeRepoPath: s.activeRepoPath,
      sidebarCollapsed: s.sidebarCollapsed,
      treeWidth: s.treeWidth,
      diffStyle: s.diffStyle,
      base: s.base,
      compare: s.compare,
      commentMode: s.commentMode,
      comments: s.comments,
      themePreference: s.themePreference,
      ignoreWhitespace: s.ignoreWhitespace,
    };
    if (!saveScheduled) {
      saveScheduled = true;
      setTimeout(flush, 250);
    }
  });
}
