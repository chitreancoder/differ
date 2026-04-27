import { create } from "zustand";
import type { DiffStyle, FileEntry, Repo, Toast } from "../types";

type State = {
  repos: Repo[];
  activeRepoPath: string | null;
  sidebarCollapsed: boolean;
  diffStyle: DiffStyle;
  base: Record<string, string>;
  compare: Record<string, string>;
  selectedCommit: Record<string, string | null>;
  currentFiles: FileEntry[];
  currentFilePath: string | null;
  paletteOpen: boolean;
  branchPickerKind: "base" | "compare" | null;
  refreshCounter: number;
  fetchingRepos: Record<string, boolean>;
  toasts: Toast[];
  hydrated: boolean;
};

type Actions = {
  hydrate: (data: Partial<State>) => void;
  addRepo: (repo: Repo) => void;
  removeRepo: (path: string) => void;
  setActiveRepo: (path: string | null) => void;
  toggleSidebar: () => void;
  setDiffStyle: (style: DiffStyle) => void;
  toggleDiffStyle: () => void;
  setBase: (repoPath: string, branch: string) => void;
  setCompare: (repoPath: string, branch: string) => void;
  swapBranches: (repoPath: string) => void;
  setSelectedCommit: (repoPath: string, sha: string | null) => void;
  setCurrentFiles: (files: FileEntry[]) => void;
  setCurrentFilePath: (path: string | null) => void;
  setPaletteOpen: (open: boolean) => void;
  togglePalette: () => void;
  setBranchPickerKind: (kind: "base" | "compare" | null) => void;
  bumpRefresh: () => void;
  setFetching: (repoPath: string, fetching: boolean) => void;
  pushToast: (message: string, kind?: "error" | "info") => void;
  dismissToast: (id: number) => void;
};

let toastSeq = 0;

export const useStore = create<State & Actions>((set) => ({
  repos: [],
  activeRepoPath: null,
  sidebarCollapsed: false,
  diffStyle: "split",
  base: {},
  compare: {},
  selectedCommit: {},
  currentFiles: [],
  currentFilePath: null,
  paletteOpen: false,
  branchPickerKind: null,
  refreshCounter: 0,
  fetchingRepos: {},
  toasts: [],
  hydrated: false,

  hydrate: (data) => set((s) => ({ ...s, ...data, hydrated: true })),

  addRepo: (repo) =>
    set((s) => {
      const existing = s.repos.findIndex((r) => r.path === repo.path);
      if (existing >= 0) {
        const repos = s.repos.slice();
        repos[existing] = { ...repos[existing], ...repo };
        return { repos, activeRepoPath: repo.path };
      }
      return { repos: [...s.repos, repo], activeRepoPath: repo.path };
    }),
  removeRepo: (path) =>
    set((s) => {
      const repos = s.repos.filter((r) => r.path !== path);
      const activeRepoPath =
        s.activeRepoPath === path ? (repos[0]?.path ?? null) : s.activeRepoPath;
      const { [path]: _b, ...base } = s.base;
      const { [path]: _c, ...compare } = s.compare;
      const { [path]: _s, ...selectedCommit } = s.selectedCommit;
      return { repos, activeRepoPath, base, compare, selectedCommit };
    }),
  setActiveRepo: (path) => set({ activeRepoPath: path, currentFilePath: null }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setDiffStyle: (style) => set({ diffStyle: style }),
  toggleDiffStyle: () =>
    set((s) => ({ diffStyle: s.diffStyle === "split" ? "unified" : "split" })),
  setBase: (repoPath, branch) =>
    set((s) => ({
      base: { ...s.base, [repoPath]: branch },
      selectedCommit: { ...s.selectedCommit, [repoPath]: null },
    })),
  setCompare: (repoPath, branch) =>
    set((s) => ({
      compare: { ...s.compare, [repoPath]: branch },
      selectedCommit: { ...s.selectedCommit, [repoPath]: null },
    })),
  swapBranches: (repoPath) =>
    set((s) => {
      const a = s.base[repoPath];
      const b = s.compare[repoPath];
      if (!a || !b) return s;
      return {
        base: { ...s.base, [repoPath]: b },
        compare: { ...s.compare, [repoPath]: a },
        selectedCommit: { ...s.selectedCommit, [repoPath]: null },
      };
    }),
  setSelectedCommit: (repoPath, sha) =>
    set((s) => ({ selectedCommit: { ...s.selectedCommit, [repoPath]: sha } })),
  setCurrentFiles: (files) => set({ currentFiles: files }),
  setCurrentFilePath: (path) => set({ currentFilePath: path }),
  setPaletteOpen: (open) => set({ paletteOpen: open }),
  togglePalette: () => set((s) => ({ paletteOpen: !s.paletteOpen })),
  setBranchPickerKind: (kind) => set({ branchPickerKind: kind }),
  bumpRefresh: () => set((s) => ({ refreshCounter: s.refreshCounter + 1 })),
  setFetching: (repoPath, fetching) =>
    set((s) => {
      const next = { ...s.fetchingRepos };
      if (fetching) next[repoPath] = true;
      else delete next[repoPath];
      return { fetchingRepos: next };
    }),
  pushToast: (message, kind = "error") =>
    set((s) => {
      if (s.toasts.some((t) => t.message === message)) return s;
      return { toasts: [...s.toasts, { id: ++toastSeq, message, kind }] };
    }),
  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
