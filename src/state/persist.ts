import { Store } from "@tauri-apps/plugin-store";
import { invoke } from "@tauri-apps/api/core";
import type { DiffStyle, Repo } from "../types";
import { useStore } from "./store";

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
  diffStyle: DiffStyle;
  base: Record<string, string>;
  compare: Record<string, string>;
};

export async function loadPersisted(): Promise<void> {
  const store = await getStore();

  const repos = ((await store.get<Repo[]>("repos")) ?? []).map((r) => ({
    ...r,
    missing: false,
  }));
  const activeRepoPath = (await store.get<string | null>("activeRepoPath")) ?? null;
  const sidebarCollapsed = (await store.get<boolean>("sidebarCollapsed")) ?? false;
  const diffStyle = (await store.get<DiffStyle>("diffStyle")) ?? "split";
  const base = (await store.get<Record<string, string>>("base")) ?? {};
  const compare = (await store.get<Record<string, string>>("compare")) ?? {};

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

  useStore.getState().hydrate({
    repos,
    activeRepoPath: repos.some((r) => r.path === activeRepoPath)
      ? activeRepoPath
      : (repos[0]?.path ?? null),
    sidebarCollapsed,
    diffStyle,
    base,
    compare,
  });
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
    await store.set("diffStyle", state.diffStyle);
    await store.set("base", state.base);
    await store.set("compare", state.compare);
    await store.save();
  };

  return useStore.subscribe((s, prev) => {
    if (!s.hydrated) return;
    const relevantChanged =
      s.repos !== prev.repos ||
      s.activeRepoPath !== prev.activeRepoPath ||
      s.sidebarCollapsed !== prev.sidebarCollapsed ||
      s.diffStyle !== prev.diffStyle ||
      s.base !== prev.base ||
      s.compare !== prev.compare;
    if (!relevantChanged) return;
    pendingState = {
      repos: s.repos,
      activeRepoPath: s.activeRepoPath,
      sidebarCollapsed: s.sidebarCollapsed,
      diffStyle: s.diffStyle,
      base: s.base,
      compare: s.compare,
    };
    if (!saveScheduled) {
      saveScheduled = true;
      setTimeout(flush, 250);
    }
  });
}
