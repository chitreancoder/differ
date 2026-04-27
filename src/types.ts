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
