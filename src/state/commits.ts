import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Commit } from "../types";
import { useStore } from "./store";

const cache = new Map<string, Commit[]>();

function makeKey(repoPath: string, base: string, compare: string): string {
  return `${repoPath}|${base}...${compare}`;
}

export function useCommits(
  repoPath: string | null,
  base: string | null,
  compare: string | null,
): { commits: Commit[]; loading: boolean; error: string | null } {
  const key = repoPath && base && compare ? makeKey(repoPath, base, compare) : null;
  const refreshCounter = useStore((s) => s.refreshCounter);
  const [commits, setCommits] = useState<Commit[]>(() =>
    key ? (cache.get(key) ?? []) : [],
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!key || !repoPath || !base || !compare) {
      setCommits([]);
      setError(null);
      return;
    }
    const cached = cache.get(key);
    if (cached) setCommits(cached);
    let cancelled = false;
    setLoading(true);
    setError(null);
    invoke<Commit[]>("list_commits", { path: repoPath, base, compare })
      .then((list) => {
        if (cancelled) return;
        cache.set(key, list);
        setCommits(list);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = String(err);
        setError(msg);
        useStore.getState().pushToast(`Failed to list commits: ${msg}`);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [key, repoPath, base, compare, refreshCounter]);

  return { commits, loading, error };
}

export function clearCommitsCache() {
  cache.clear();
}
