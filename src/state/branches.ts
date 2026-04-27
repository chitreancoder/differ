import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Branch } from "../types";
import { useStore } from "./store";

const cache = new Map<string, Branch[]>();

export function useBranches(repoPath: string | null): {
  branches: Branch[];
  loading: boolean;
} {
  const [branches, setBranches] = useState<Branch[]>(() =>
    repoPath ? (cache.get(repoPath) ?? []) : [],
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!repoPath) {
      setBranches([]);
      return;
    }
    const cached = cache.get(repoPath);
    if (cached) setBranches(cached);
    let cancelled = false;
    setLoading(true);
    invoke<Branch[]>("list_branches", { path: repoPath })
      .then((list) => {
        if (cancelled) return;
        cache.set(repoPath, list);
        setBranches(list);
      })
      .catch((err) => {
        if (cancelled) return;
        useStore.getState().pushToast(`Failed to list branches: ${err}`);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [repoPath]);

  return { branches, loading };
}

export function clearBranchCache(repoPath?: string) {
  if (repoPath) cache.delete(repoPath);
  else cache.clear();
}
