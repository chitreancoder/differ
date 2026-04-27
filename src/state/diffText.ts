import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "./store";

type Key = string;
const CACHE_LIMIT = 200;
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

function makeKey(
  repoPath: string,
  base: string,
  compare: string,
  selectedCommit: string | null,
  filePath: string,
): Key {
  return selectedCommit
    ? `${repoPath}commit${selectedCommit}${filePath}`
    : `${repoPath}${base}...${compare}${filePath}`;
}

export function useDiffText(
  repoPath: string,
  base: string,
  compare: string,
  selectedCommit: string | null,
  filePath: string,
  enabled: boolean,
): { diffText: string | null; loading: boolean; error: string | null } {
  const key = makeKey(repoPath, base, compare, selectedCommit, filePath);
  const refreshCounter = useStore((s) => s.refreshCounter);
  const [diffText, setDiffText] = useState<string | null>(
    cacheGet(key) ?? null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDiffText(cacheGet(key) ?? null);
    setError(null);
  }, [key]);

  useEffect(() => {
    if (!enabled) return;
    const cached = cacheGet(key);
    if (cached !== undefined) {
      setDiffText(cached);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const promise = selectedCommit
      ? invoke<string>("diff_commit_file", {
          path: repoPath,
          sha: selectedCommit,
          file: filePath,
        })
      : invoke<string>("diff_file", {
          path: repoPath,
          base,
          compare,
          file: filePath,
        });
    promise
      .then((text) => {
        if (cancelled) return;
        cacheSet(key, text);
        setDiffText(text);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(String(err));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [key, enabled, refreshCounter]);

  return { diffText, loading, error };
}

export function clearDiffTextCache() {
  cache.clear();
}
