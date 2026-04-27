import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Branch } from "../types";
import { useStore } from "./store";

const cache = new Map<string, Branch[]>();

export function useBranches(repoPath: string | null): {
  branches: Branch[];
  loading: boolean;
  reload: () => Promise<void>;
} {
  const [branches, setBranches] = useState<Branch[]>(() =>
    repoPath ? (cache.get(repoPath) ?? []) : [],
  );
  const [loading, setLoading] = useState(false);

  const fetchBranches = async (path: string) => {
    setLoading(true);
    try {
      const list = await invoke<Branch[]>("list_branches", { path });
      cache.set(path, list);
      setBranches(list);
    } catch (err) {
      useStore.getState().pushToast(`Failed to list branches: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!repoPath) {
      setBranches([]);
      return;
    }
    const cached = cache.get(repoPath);
    if (cached) setBranches(cached);
    fetchBranches(repoPath);
  }, [repoPath]);

  return {
    branches,
    loading,
    reload: () => (repoPath ? fetchBranches(repoPath) : Promise.resolve()),
  };
}

export function clearBranchCache(repoPath?: string) {
  if (repoPath) cache.delete(repoPath);
  else cache.clear();
}
