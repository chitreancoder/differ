import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { FileEntry } from "../types";
import { useStore } from "./store";

export type TreeNode =
  | {
      type: "folder";
      path: string;
      name: string;
      depth: number;
      children: TreeNode[];
    }
  | {
      type: "file";
      path: string;
      name: string;
      depth: number;
      entry: FileEntry;
    };

export function useDiffFiles(
  repoPath: string | null,
  base: string | null,
  compare: string | null,
  selectedCommit: string | null,
): { files: FileEntry[]; loading: boolean; error: string | null } {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshCounter = useStore((s) => s.refreshCounter);

  useEffect(() => {
    let cancelled = false;
    if (!repoPath || !base || !compare) {
      setFiles([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    const promise = selectedCommit
      ? invoke<FileEntry[]>("diff_commit_name_status", {
          path: repoPath,
          sha: selectedCommit,
        })
      : invoke<FileEntry[]>("diff_name_status", {
          path: repoPath,
          base,
          compare,
        });
    promise
      .then((list) => {
        if (cancelled) return;
        setFiles(list);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = String(err);
        setError(msg);
        useStore.getState().pushToast(`Diff failed: ${msg}`);
        setFiles([]);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [repoPath, base, compare, selectedCommit, refreshCounter]);

  return { files, loading, error };
}

export function buildTree(files: FileEntry[]): TreeNode {
  const root: TreeNode = {
    type: "folder",
    path: "",
    name: "",
    depth: -1,
    children: [],
  };

  for (const file of files) {
    const parts = file.path.split("/");
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const folderName = parts[i];
      const folderPath = parts.slice(0, i + 1).join("/");
      let child = node.children.find(
        (c): c is Extract<TreeNode, { type: "folder" }> =>
          c.type === "folder" && c.name === folderName,
      );
      if (!child) {
        child = {
          type: "folder",
          path: folderPath,
          name: folderName,
          depth: i,
          children: [],
        };
        node.children.push(child);
      }
      node = child;
    }
    node.children.push({
      type: "file",
      path: file.path,
      name: parts[parts.length - 1],
      depth: parts.length - 1,
      entry: file,
    });
  }

  const sortRecursive = (n: TreeNode) => {
    if (n.type !== "folder") return;
    n.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    n.children.forEach(sortRecursive);
  };
  sortRecursive(root);

  return root;
}

export type FlatRow = {
  node: TreeNode;
  expanded: boolean;
  hasChildren: boolean;
};

export function flattenTree(
  root: TreeNode,
  collapsed: Set<string>,
): FlatRow[] {
  const rows: FlatRow[] = [];
  const walk = (n: TreeNode) => {
    if (n.depth >= 0) {
      const hasChildren = n.type === "folder" && n.children.length > 0;
      const expanded = !collapsed.has(n.path);
      rows.push({ node: n, expanded, hasChildren });
      if (n.type === "folder" && !expanded) return;
    }
    if (n.type === "folder") {
      for (const child of n.children) walk(child);
    }
  };
  walk(root);
  return rows;
}
