import { create } from "zustand";
import type { DiffStyle, Repo } from "../types";

type State = {
  repos: Repo[];
  activeRepoPath: string | null;
  sidebarCollapsed: boolean;
  diffStyle: DiffStyle;
  base: Record<string, string>;
  compare: Record<string, string>;
  selectedCommit: Record<string, string | null>;
};

type Actions = {
  addRepo: (repo: Repo) => void;
  removeRepo: (path: string) => void;
  setActiveRepo: (path: string | null) => void;
  toggleSidebar: () => void;
  setDiffStyle: (style: DiffStyle) => void;
  setBase: (repoPath: string, branch: string) => void;
  setCompare: (repoPath: string, branch: string) => void;
  swapBranches: (repoPath: string) => void;
  setSelectedCommit: (repoPath: string, sha: string | null) => void;
};

export const useStore = create<State & Actions>((set) => ({
  repos: [],
  activeRepoPath: null,
  sidebarCollapsed: false,
  diffStyle: "split",
  base: {},
  compare: {},
  selectedCommit: {},

  addRepo: (repo) =>
    set((s) => {
      if (s.repos.some((r) => r.path === repo.path)) return s;
      return { repos: [...s.repos, repo], activeRepoPath: repo.path };
    }),
  removeRepo: (path) =>
    set((s) => {
      const repos = s.repos.filter((r) => r.path !== path);
      const activeRepoPath =
        s.activeRepoPath === path ? (repos[0]?.path ?? null) : s.activeRepoPath;
      return { repos, activeRepoPath };
    }),
  setActiveRepo: (path) => set({ activeRepoPath: path }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setDiffStyle: (style) => set({ diffStyle: style }),
  setBase: (repoPath, branch) =>
    set((s) => ({ base: { ...s.base, [repoPath]: branch } })),
  setCompare: (repoPath, branch) =>
    set((s) => ({ compare: { ...s.compare, [repoPath]: branch } })),
  swapBranches: (repoPath) =>
    set((s) => {
      const a = s.base[repoPath];
      const b = s.compare[repoPath];
      if (!a || !b) return s;
      return {
        base: { ...s.base, [repoPath]: b },
        compare: { ...s.compare, [repoPath]: a },
      };
    }),
  setSelectedCommit: (repoPath, sha) =>
    set((s) => ({ selectedCommit: { ...s.selectedCommit, [repoPath]: sha } })),
}));
