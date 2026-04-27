import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { FileEntry, FileStatus } from "../types";
import {
  buildTree,
  flattenTree,
  type FlatRow,
} from "../state/diff";

const ROW_HEIGHT = 24;

type Props = {
  files: FileEntry[];
  loading: boolean;
  selectedPath: string | null;
  onSelect: (path: string) => void;
};

function statusGlyph(status: FileStatus): {
  letter: string;
  className: string;
  title: string;
} {
  switch (status.kind) {
    case "added":
      return { letter: "A", className: "added", title: "Added" };
    case "modified":
      return { letter: "M", className: "modified", title: "Modified" };
    case "deleted":
      return { letter: "D", className: "deleted", title: "Deleted" };
    case "renamed":
      return {
        letter: "R",
        className: "renamed",
        title: `Renamed from ${status.from}`,
      };
    case "copied":
      return {
        letter: "C",
        className: "copied",
        title: `Copied from ${status.from}`,
      };
    case "typeChanged":
      return { letter: "T", className: "modified", title: "Type changed" };
    case "unmerged":
      return { letter: "U", className: "deleted", title: "Unmerged" };
    case "unknown":
      return { letter: "?", className: "unknown", title: "Unknown" };
  }
}

export function FileTree({ files, loading, selectedPath, onSelect }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const parentRef = useRef<HTMLDivElement>(null);

  const tree = useMemo(() => buildTree(files), [files]);
  const rows = useMemo(() => flattenTree(tree, collapsed), [tree, collapsed]);

  const totals = useMemo(() => {
    let additions = 0;
    let deletions = 0;
    for (const f of files) {
      additions += f.additions;
      deletions += f.deletions;
    }
    return { additions, deletions };
  }, [files]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const toggleFolder = (path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  return (
    <div className="filetree">
      <div className="filetree-header">
        <span className="filetree-count">
          {files.length} {files.length === 1 ? "file" : "files"}
        </span>
        {(totals.additions > 0 || totals.deletions > 0) && (
          <span className="filetree-totals">
            <span className="counts-add">+{totals.additions}</span>{" "}
            <span className="counts-del">−{totals.deletions}</span>
          </span>
        )}
        {loading && <span className="muted filetree-loading">…</span>}
      </div>
      {!loading && files.length === 0 ? (
        <div className="filetree-empty muted">No files changed</div>
      ) : (
        <div ref={parentRef} className="filetree-scroll">
          <div
            style={{
              height: virtualizer.getTotalSize(),
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((vrow) => {
              const row = rows[vrow.index];
              return (
                <div
                  key={vrow.key}
                  className="filetree-row-positioner"
                  style={{
                    transform: `translateY(${vrow.start}px)`,
                    height: vrow.size,
                  }}
                >
                  <Row
                    row={row}
                    selectedPath={selectedPath}
                    onSelect={onSelect}
                    onToggleFolder={toggleFolder}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({
  row,
  selectedPath,
  onSelect,
  onToggleFolder,
}: {
  row: FlatRow;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onToggleFolder: (path: string) => void;
}) {
  const { node } = row;
  const indent = node.depth * 12 + 6;

  if (node.type === "folder") {
    return (
      <button
        className="filetree-row folder"
        style={{ paddingLeft: indent }}
        onClick={() => onToggleFolder(node.path)}
      >
        <span className="filetree-chevron">{row.expanded ? "▾" : "▸"}</span>
        <span className="filetree-name">{node.name}</span>
      </button>
    );
  }

  const glyph = statusGlyph(node.entry.status);
  const isSelected = selectedPath === node.path;

  return (
    <button
      className={`filetree-row file ${isSelected ? "selected" : ""}`}
      style={{ paddingLeft: indent + 14 }}
      onClick={() => onSelect(node.path)}
      title={node.entry.status.kind === "renamed" ? glyph.title : node.path}
    >
      <span className={`filetree-status ${glyph.className}`}>
        {glyph.letter}
      </span>
      <span className="filetree-name">{node.name}</span>
      {!node.entry.isBinary &&
        (node.entry.additions > 0 || node.entry.deletions > 0) && (
          <span className="filetree-counts">
            {node.entry.additions > 0 && (
              <span className="counts-add">+{node.entry.additions}</span>
            )}
            {node.entry.deletions > 0 && (
              <span className="counts-del">−{node.entry.deletions}</span>
            )}
          </span>
        )}
      {node.entry.isBinary && <span className="filetree-binary muted">bin</span>}
    </button>
  );
}
