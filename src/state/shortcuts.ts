import { useEffect } from "react";
import { useStore } from "./store";
import { fetchRemote, refreshAll } from "./refresh";
import { fileAnchorId } from "../utils/diff";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

function scrollToFile(path: string) {
  const el = document.getElementById(fileAnchorId(path));
  el?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function useShortcuts() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      const store = useStore.getState();

      const lower = e.key.length === 1 ? e.key.toLowerCase() : e.key;

      if (meta && lower === "k") {
        e.preventDefault();
        store.togglePalette();
        return;
      }

      if (store.paletteOpen) return;

      if (meta && e.key === "\\") {
        e.preventDefault();
        store.toggleSidebar();
        return;
      }

      if (meta && lower === "l") {
        e.preventDefault();
        store.toggleDiffStyle();
        return;
      }

      if (meta && lower === "r") {
        e.preventDefault();
        if (store.activeRepoPath) {
          fetchRemote(store.activeRepoPath);
        } else {
          refreshAll();
        }
        return;
      }

      if (meta && /^[1-9]$/.test(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        const repo = store.repos[idx];
        if (repo && !repo.missing) {
          e.preventDefault();
          store.setActiveRepo(repo.path);
        }
        return;
      }

      if (!meta && !e.altKey && (lower === "j" || lower === "k")) {
        if (isTypingTarget(e.target)) return;
        const files = store.currentFiles;
        if (files.length === 0) return;
        const current = store.currentFilePath;
        const idx = current ? files.findIndex((f) => f.path === current) : -1;
        const next =
          lower === "j"
            ? idx < 0
              ? 0
              : Math.min(files.length - 1, idx + 1)
            : idx < 0
              ? 0
              : Math.max(0, idx - 1);
        const path = files[next].path;
        e.preventDefault();
        store.setCurrentFilePath(path);
        scrollToFile(path);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}
