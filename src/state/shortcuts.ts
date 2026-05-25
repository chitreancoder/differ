import { useEffect, useRef } from "react";
import { useStore } from "./store";
import { fetchRemote, refreshAll } from "./refresh";
import { visibleFilePaths } from "./diff";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

export function useShortcuts() {
  const lastG = useRef(0);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      const store = useStore.getState();
      const lower = e.key.length === 1 ? e.key.toLowerCase() : e.key;

      if (e.key === "Escape") {
        if (store.paletteOpen) store.setPaletteOpen(false);
        if (store.shortcutsOpen) store.setShortcutsOpen(false);
        return;
      }

      if (meta && (lower === "k" || lower === "p")) {
        e.preventDefault();
        store.togglePalette();
        return;
      }

      if (store.paletteOpen || store.shortcutsOpen) return;

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

      if (meta && e.shiftKey && lower === "t") {
        e.preventDefault();
        store.cycleThemePreference();
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

      if (meta || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      const visible = visibleFilePaths(
        store.currentFiles,
        store.collapsedFolders,
      );
      const current = store.currentFilePath;
      const idx = current ? visible.indexOf(current) : -1;

      if (lower === "j" || e.key === "ArrowDown") {
        if (visible.length === 0) return;
        e.preventDefault();
        const next = idx < 0 ? 0 : Math.min(visible.length - 1, idx + 1);
        store.setCurrentFilePath(visible[next]);
        return;
      }

      if (lower === "k" || e.key === "ArrowUp") {
        if (visible.length === 0) return;
        e.preventDefault();
        const next = idx < 0 ? 0 : Math.max(0, idx - 1);
        store.setCurrentFilePath(visible[next]);
        return;
      }

      if (e.key === "g") {
        if (visible.length === 0) return;
        const now = Date.now();
        if (now - lastG.current < 400) {
          lastG.current = 0;
          e.preventDefault();
          store.setCurrentFilePath(visible[0]);
        } else {
          lastG.current = now;
        }
        return;
      }

      if (e.key === "G") {
        if (visible.length === 0) return;
        e.preventDefault();
        store.setCurrentFilePath(visible[visible.length - 1]);
        return;
      }

      if (lower === "x") {
        if (!current) return;
        e.preventDefault();
        store.toggleReviewed(current);
        return;
      }

      if (lower === "n") {
        if (visible.length === 0) return;
        e.preventDefault();
        const reviewed = store.reviewed;
        const start = idx < 0 ? -1 : idx;
        const total = visible.length;
        for (let step = 1; step <= total; step++) {
          const probe = (start + step + total) % total;
          if (!reviewed.has(visible[probe])) {
            store.setCurrentFilePath(visible[probe]);
            return;
          }
        }
        return;
      }

      if (lower === "d") {
        e.preventDefault();
        store.toggleDiffStyle();
        return;
      }

      if (lower === "c") {
        e.preventDefault();
        store.toggleCommentMode();
        return;
      }

      if (lower === "w") {
        e.preventDefault();
        store.toggleIgnoreWhitespace();
        return;
      }

      if (e.key === "?") {
        e.preventDefault();
        store.toggleShortcuts();
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}
