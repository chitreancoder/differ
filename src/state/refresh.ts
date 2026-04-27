import { invoke } from "@tauri-apps/api/core";
import { clearBranchCache } from "./branches";
import { clearCommitsCache } from "./commits";
import { clearDiffTextCache } from "./diffText";
import { useStore } from "./store";

const inFlight = new Map<string, Promise<void>>();
const fetchedThisSession = new Set<string>();

export function refreshAll() {
  clearBranchCache();
  clearCommitsCache();
  clearDiffTextCache();
  useStore.getState().bumpRefresh();
}

export function fetchRemote(repoPath: string): Promise<void> {
  const existing = inFlight.get(repoPath);
  if (existing) return existing;
  const store = useStore.getState();
  store.setFetching(repoPath, true);
  const promise = invoke<void>("repo_fetch", { path: repoPath })
    .then(() => {
      fetchedThisSession.add(repoPath);
      refreshAll();
    })
    .catch((err) => {
      const msg = String(err);
      if (!/no remote|no such remote|does not appear to be a git/i.test(msg)) {
        useStore.getState().pushToast(`Fetch failed: ${msg}`);
      }
    })
    .finally(() => {
      inFlight.delete(repoPath);
      useStore.getState().setFetching(repoPath, false);
    });
  inFlight.set(repoPath, promise);
  return promise;
}

export function autoFetchOnce(repoPath: string) {
  if (fetchedThisSession.has(repoPath)) return;
  if (inFlight.has(repoPath)) return;
  fetchRemote(repoPath);
}

export function clearFetchSessionCache() {
  fetchedThisSession.clear();
}
