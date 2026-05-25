export type Repo = {
  path: string;
  name: string;
  defaultBranch: string | null;
  headBranch: string | null;
  missing?: boolean;
};

export type Toast = {
  id: number;
  message: string;
  kind: "error" | "info";
};

export type Branch = {
  name: string;
  isRemote: boolean;
  isHead: boolean;
  upstream: string | null;
};

export type Commit = {
  sha: string;
  shortSha: string;
  summary: string;
  authorName: string;
  authorEmail: string;
  timestamp: number;
  isMerge: boolean;
};

export type FileStatus =
  | { kind: "added" }
  | { kind: "modified" }
  | { kind: "deleted" }
  | { kind: "renamed"; from: string }
  | { kind: "copied"; from: string }
  | { kind: "typeChanged" }
  | { kind: "unmerged" }
  | { kind: "unknown" };

export type FileEntry = {
  path: string;
  status: FileStatus;
  additions: number;
  deletions: number;
  isBinary: boolean;
};

export type DiffStyle = "split" | "unified";

export type ThemePreference = "system" | "light" | "dark";

export type ReviewComment = {
  id: string; // crypto.randomUUID()
  file: string; // == CodeView item id / file path
  /** Absent ⇒ file-level note (no line anchor, no captured snippet). */
  range?: { start: number; end: number; side: "old" | "new" };
  /** Captured code text at creation; absent for file-level notes. */
  snippet?: string;
  body: string; // freeform note
  createdAt: number;
  sent: boolean; // set true on export; reset to false if body edited
};

export const WORKING_TREE_REF = ":working-tree";

export function isWorkingTree(ref: string | null): boolean {
  return ref === WORKING_TREE_REF;
}
