/**
 * Central Zustand store. UI state (active repo, branch selections, comment
 * drafts, modals) lives here; data fetched from the Rust side (branches,
 * commits, diffs) is cached in the per-domain hook modules (state/branches.ts,
 * state/commits.ts, state/diff.ts, state/fullDiff.ts) and not duplicated here.
 */
import { create } from "zustand";
import type {
  DiffStyle,
  FileEntry,
  Repo,
  ReviewComment,
  ThemePreference,
  Toast,
} from "@/types";

type State = {
  repos: Repo[];
  activeRepoPath: string | null;
  sidebarCollapsed: boolean;
  treeWidth: number;
  diffStyle: DiffStyle;
  base: Record<string, string>;
  compare: Record<string, string>;
  selectedCommit: Record<string, string | null>;
  currentFiles: FileEntry[];
  currentFilePath: string | null;
  collapsedFolders: Set<string>;
  reviewed: Set<string>;
  reviewedScope: string | null;
  paletteOpen: boolean;
  shortcutsOpen: boolean;
  branchPickerKind: "base" | "compare" | null;
  refreshCounter: number;
  fetchingRepos: Record<string, boolean>;
  toasts: Toast[];
  commentMode: boolean;
  comments: Record<string, ReviewComment[]>;
  themePreference: ThemePreference;
  ignoreWhitespace: boolean;
  /** Transient view filter: when true, the file tree only shows files with
   *  at least one comment in the current scope. Reset on every cold start. */
  commentsOnlyFilter: boolean;
  /** In-diff find overlay state. Not persisted. */
  searchOpen: boolean;
  searchQuery: string;
  hydrated: boolean;
};

type Actions = {
  hydrate: (data: Partial<State>) => void;
  addRepo: (repo: Repo) => void;
  removeRepo: (path: string) => void;
  setActiveRepo: (path: string | null) => void;
  toggleSidebar: () => void;
  setTreeWidth: (width: number) => void;
  setDiffStyle: (style: DiffStyle) => void;
  toggleDiffStyle: () => void;
  setBase: (repoPath: string, branch: string) => void;
  setCompare: (repoPath: string, branch: string) => void;
  swapBranches: (repoPath: string) => void;
  setSelectedCommit: (repoPath: string, sha: string | null) => void;
  setCurrentFiles: (files: FileEntry[]) => void;
  setCurrentFilePath: (path: string | null) => void;
  toggleFolder: (path: string) => void;
  ensureReviewedScope: (scope: string | null) => void;
  toggleReviewed: (path: string) => void;
  markAllReviewed: (paths: string[]) => void;
  clearReviewed: () => void;
  setPaletteOpen: (open: boolean) => void;
  togglePalette: () => void;
  setShortcutsOpen: (open: boolean) => void;
  toggleShortcuts: () => void;
  setBranchPickerKind: (kind: "base" | "compare" | null) => void;
  bumpRefresh: () => void;
  setFetching: (repoPath: string, fetching: boolean) => void;
  pushToast: (message: string, kind?: "error" | "info") => void;
  dismissToast: (id: number) => void;
  toggleCommentMode: () => void;
  setCommentMode: (on: boolean) => void;
  addComment: (scope: string, comment: ReviewComment) => void;
  updateComment: (
    scope: string,
    id: string,
    patch: Partial<ReviewComment>,
  ) => void;
  removeComment: (scope: string, id: string) => void;
  markCommentsSent: (scope: string, ids: string[]) => void;
  setThemePreference: (p: ThemePreference) => void;
  cycleThemePreference: () => void;
  setIgnoreWhitespace: (on: boolean) => void;
  toggleIgnoreWhitespace: () => void;
  toggleCommentsOnlyFilter: () => void;
  setCommentsOnlyFilter: (on: boolean) => void;
  setSearchOpen: (open: boolean) => void;
  toggleSearchOpen: () => void;
  setSearchQuery: (q: string) => void;
};

let toastSeq = 0;

export const useStore = create<State & Actions>((set) => ({
  repos: [],
  activeRepoPath: null,
  sidebarCollapsed: false,
  treeWidth: 280,
  diffStyle: "split",
  base: {},
  compare: {},
  selectedCommit: {},
  currentFiles: [],
  currentFilePath: null,
  collapsedFolders: new Set<string>(),
  reviewed: new Set<string>(),
  reviewedScope: null,
  paletteOpen: false,
  shortcutsOpen: false,
  branchPickerKind: null,
  refreshCounter: 0,
  fetchingRepos: {},
  toasts: [],
  commentMode: false,
  comments: {},
  themePreference: "system",
  ignoreWhitespace: false,
  commentsOnlyFilter: false,
  searchOpen: false,
  searchQuery: "",
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
  setTreeWidth: (width) =>
    set({ treeWidth: Math.max(180, Math.min(640, Math.round(width))) }),
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
  toggleFolder: (path) =>
    set((s) => {
      const next = new Set(s.collapsedFolders);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return { collapsedFolders: next };
    }),
  ensureReviewedScope: (scope) =>
    set((s) =>
      s.reviewedScope === scope
        ? s
        : {
            reviewedScope: scope,
            reviewed: new Set<string>(),
            collapsedFolders: new Set<string>(),
          },
    ),
  toggleReviewed: (path) =>
    set((s) => {
      const next = new Set(s.reviewed);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return { reviewed: next };
    }),
  markAllReviewed: (paths) => set({ reviewed: new Set(paths) }),
  clearReviewed: () => set({ reviewed: new Set<string>() }),
  setPaletteOpen: (open) => set({ paletteOpen: open }),
  togglePalette: () => set((s) => ({ paletteOpen: !s.paletteOpen })),
  setShortcutsOpen: (open) => set({ shortcutsOpen: open }),
  toggleShortcuts: () => set((s) => ({ shortcutsOpen: !s.shortcutsOpen })),
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
  toggleCommentMode: () => set((s) => ({ commentMode: !s.commentMode })),
  setCommentMode: (on) => set({ commentMode: on }),
  addComment: (scope, comment) =>
    set((s) => ({
      comments: {
        ...s.comments,
        [scope]: [...(s.comments[scope] ?? []), comment],
      },
    })),
  updateComment: (scope, id, patch) =>
    set((s) => {
      const bucket = s.comments[scope];
      if (!bucket) return s;
      return {
        comments: {
          ...s.comments,
          [scope]: bucket.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        },
      };
    }),
  removeComment: (scope, id) =>
    set((s) => {
      const bucket = s.comments[scope];
      if (!bucket) return s;
      const next = bucket.filter((c) => c.id !== id);
      const comments = { ...s.comments };
      // Light pruning: drop scope buckets once empty.
      if (next.length === 0) delete comments[scope];
      else comments[scope] = next;
      return { comments };
    }),
  markCommentsSent: (scope, ids) =>
    set((s) => {
      const bucket = s.comments[scope];
      if (!bucket) return s;
      const idSet = new Set(ids);
      return {
        comments: {
          ...s.comments,
          [scope]: bucket.map((c) =>
            idSet.has(c.id) ? { ...c, sent: true } : c,
          ),
        },
      };
    }),
  setThemePreference: (p) => set({ themePreference: p }),
  cycleThemePreference: () =>
    set((s) => ({
      themePreference:
        s.themePreference === "system"
          ? "light"
          : s.themePreference === "light"
            ? "dark"
            : "system",
    })),
  setIgnoreWhitespace: (on) => set({ ignoreWhitespace: on }),
  toggleIgnoreWhitespace: () =>
    set((s) => ({ ignoreWhitespace: !s.ignoreWhitespace })),
  setCommentsOnlyFilter: (on) => set({ commentsOnlyFilter: on }),
  toggleCommentsOnlyFilter: () =>
    set((s) => ({ commentsOnlyFilter: !s.commentsOnlyFilter })),
  setSearchOpen: (open) => set({ searchOpen: open }),
  toggleSearchOpen: () => set((s) => ({ searchOpen: !s.searchOpen })),
  setSearchQuery: (q) => set({ searchQuery: q }),
}));
