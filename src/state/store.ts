import { create } from "zustand";
import type { DiffStyle, Repo, Toast } from "../types";

type State = {
  repos: Repo[];
  activeRepoPath: string | null;
  sidebarCollapsed: boolean;
  diffStyle: DiffStyle;
  base: Record<string, string>;
  compare: Record<string, string>;
  selectedCommit: Record<string, string | null>;
  toasts: Toast[];
  hydrated: boolean;
};

type Actions = {
  hydrate: (data: Partial<State>) => void;
  addRepo: (repo: Repo) => void;
  removeRepo: (path: string) => void;
  updateRepo: (path: string, patch: Partial<Repo>) => void;
  setActiveRepo: (path: string | null) => void;
  toggleSidebar: () => void;
  setDiffStyle: (style: DiffStyle) => void;
  setBase: (repoPath: string, branch: string) => void;
  setCompare: (repoPath: string, branch: string) => void;
  swapBranches: (repoPath: string) => void;
  setSelectedCommit: (repoPath: string, sha: string | null) => void;
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
  toasts: [],
  hydrated: false,

  hydrate: (data) => set((s) => ({ ...s, ...data, hydrated: true })),

  addRepo: (repo) =>
    set((s) => {
      if (s.repos.some((r) => r.path === repo.path)) {
        return { activeRepoPath: repo.path };
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
  updateRepo: (path, patch) =>
    set((s) => ({
      repos: s.repos.map((r) => (r.path === path ? { ...r, ...patch } : r)),
    })),
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
  pushToast: (message, kind = "error") =>
    set((s) => ({ toasts: [...s.toasts, { id: ++toastSeq, message, kind }] })),
  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
