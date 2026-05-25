import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isWorkingTree } from "../types";
import { useStore } from "./store";

type Key = string;
const CACHE_LIMIT = 20;
const cache = new Map<Key, string>();

function cacheGet(key: Key): string | undefined {
  const value = cache.get(key);
  if (value !== undefined) {
    cache.delete(key);
    cache.set(key, value);
  }
  return value;
}

function cacheSet(key: Key, value: string): void {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

export function fullDiffKey(
  repoPath: string,
  base: string,
  compare: string,
  selectedCommit: string | null,
  ignoreWhitespace: boolean,
): Key {
  const ws = ignoreWhitespace ? "|w" : "";
  return selectedCommit
    ? `${repoPath}|commit|${selectedCommit}${ws}`
    : `${repoPath}|${base}...${compare}${ws}`;
}

/**
 * Fetches the entire multi-file patch for the current comparison in one shot.
 * `@pierre/diffs`' CodeView virtualizes across all files, so we no longer fetch
 * per-file — the whole patch is parsed once and rendered as a single surface.
 */
export function useFullDiff(
  repoPath: string | null,
  base: string | null,
  compare: string | null,
  selectedCommit: string | null,
): { patch: string | null; loading: boolean; error: string | null } {
  const refreshCounter = useStore((s) => s.refreshCounter);
  const ignoreWhitespace = useStore((s) => s.ignoreWhitespace);
  const key =
    repoPath && base && compare
      ? fullDiffKey(repoPath, base, compare, selectedCommit, ignoreWhitespace)
      : null;
  const [patch, setPatch] = useState<string | null>(
    key ? (cacheGet(key) ?? null) : null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!repoPath || !base || !compare || !key) {
      setPatch(null);
      setError(null);
      return;
    }
    const cached = cacheGet(key);
    if (cached !== undefined) {
      setPatch(cached);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPatch(null);
    const promise = selectedCommit
      ? invoke<string>("diff_commit_all", {
          path: repoPath,
          sha: selectedCommit,
          ignoreWhitespace,
        })
      : isWorkingTree(compare)
        ? invoke<string>("diff_working_tree_all", {
            path: repoPath,
            base,
            ignoreWhitespace,
          })
        : invoke<string>("diff_all", {
            path: repoPath,
            base,
            compare,
            ignoreWhitespace,
          });
    promise
      .then((text) => {
        if (cancelled) return;
        cacheSet(key, text);
        setPatch(text);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = String(err);
        setError(msg);
        useStore.getState().pushToast(`Diff failed: ${msg}`);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [key, refreshCounter]);

  return { patch, loading, error };
}

export function clearFullDiffCache() {
  cache.clear();
}
