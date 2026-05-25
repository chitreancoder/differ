import { useEffect, useMemo, useRef, useState } from "react";
import type { CodeViewHandle } from "@pierre/diffs/react";
import type { FileDiffMetadata, SelectionSide } from "@pierre/diffs";
import type { ReviewComment } from "../types";
import { useStore } from "../state/store";

type Match = {
  file: string;
  lineNumber: number;
  side: "old" | "new";
};

function findMatches(
  fileDiffs: Map<string, FileDiffMetadata>,
  fileOrder: string[],
  query: string,
): Match[] {
  if (!query) return [];
  const needle = query.toLowerCase();
  const ordered: FileDiffMetadata[] = [];
  const seen = new Set<string>();
  for (const path of fileOrder) {
    const fd = fileDiffs.get(path);
    if (fd) {
      ordered.push(fd);
      seen.add(path);
    }
  }
  for (const [name, fd] of fileDiffs) {
    if (!seen.has(name)) ordered.push(fd);
  }
  const out: Match[] = [];
  for (const fd of ordered) {
    for (const hunk of fd.hunks) {
      // Additions side: walk additionCount rows from additionStart; line text
      // at additionLines[additionLineIndex + i]. Context lines appear here too
      // and will produce a "new"-side match.
      for (let i = 0; i < hunk.additionCount; i++) {
        const text = fd.additionLines[hunk.additionLineIndex + i];
        if (text != null && text.toLowerCase().includes(needle)) {
          out.push({
            file: fd.name,
            lineNumber: hunk.additionStart + i,
            side: "new",
          });
        }
      }
      // Deletions side: same idea, mirrored. Context lines repeat here on the
      // old side — that's correct in split view (two visible rows) and a
      // minor over-count in unified (one visible row, two matches).
      for (let i = 0; i < hunk.deletionCount; i++) {
        const text = fd.deletionLines[hunk.deletionLineIndex + i];
        if (text != null && text.toLowerCase().includes(needle)) {
          out.push({
            file: fd.name,
            lineNumber: hunk.deletionStart + i,
            side: "old",
          });
        }
      }
    }
  }
  return out;
}

function toLibSide(side: "old" | "new"): SelectionSide {
  return side === "old" ? "deletions" : "additions";
}

type Props = {
  fileDiffs: Map<string, FileDiffMetadata>;
  fileOrder: string[];
  viewRef: React.RefObject<CodeViewHandle<ReviewComment> | null>;
};

/**
 * In-diff find overlay (⌘F). Walks every hunk's line arrays for a substring
 * match (case-insensitive); Enter/Shift-Enter cycle, Escape closes. Pierre
 * has no public text-search API and no public per-line-highlight hook — we
 * only jump the viewport via viewRef.scrollTo and rely on the user's eye to
 * spot the line; matches aren't painted in 0.2.1.
 */
export function DiffSearch({ fileDiffs, fileOrder, viewRef }: Props) {
  const open = useStore((s) => s.searchOpen);
  const query = useStore((s) => s.searchQuery);
  const setQuery = useStore((s) => s.setSearchQuery);
  const setOpen = useStore((s) => s.setSearchOpen);
  const inputRef = useRef<HTMLInputElement>(null);
  const [index, setIndex] = useState(0);

  // Debounce the query so big patches don't re-scan on every keystroke.
  // 150ms is the sweet spot — still feels responsive, halves the scan count
  // for typical typing speeds vs the previous 80ms.
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(query), 150);
    return () => window.clearTimeout(t);
  }, [query]);

  const matches = useMemo(
    () => findMatches(fileDiffs, fileOrder, debouncedQuery.trim()),
    [fileDiffs, fileOrder, debouncedQuery],
  );

  // Clamp/reset index when matches change.
  useEffect(() => {
    if (matches.length === 0) {
      setIndex(0);
      return;
    }
    setIndex((i) => Math.max(0, Math.min(i, matches.length - 1)));
  }, [matches]);

  // Auto-focus the input when opened.
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  // Jump to current match.
  useEffect(() => {
    if (!open) return;
    const m = matches[index];
    if (!m) return;
    viewRef.current?.scrollTo({
      type: "line",
      id: m.file,
      lineNumber: m.lineNumber,
      side: toLibSide(m.side),
      align: "center",
    });
  }, [index, matches, open, viewRef]);

  if (!open) return null;

  const total = matches.length;
  const goPrev = () => {
    if (total === 0) return;
    setIndex((i) => (i - 1 + total) % total);
  };
  const goNext = () => {
    if (total === 0) return;
    setIndex((i) => (i + 1) % total);
  };
  const close = () => {
    setOpen(false);
  };

  return (
    <div className="diff-search" role="search">
      <input
        ref={inputRef}
        className="diff-search-input"
        type="text"
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        placeholder="Find in diff"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            close();
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (e.shiftKey) goPrev();
            else goNext();
          }
        }}
      />
      <span className="diff-search-count">
        {total === 0 && query
          ? "no matches"
          : total === 0
            ? ""
            : `${index + 1}/${total}`}
      </span>
      <button
        className="diff-search-btn"
        onClick={goPrev}
        disabled={total === 0}
        title="Previous match (Shift-Enter)"
      >
        ↑
      </button>
      <button
        className="diff-search-btn"
        onClick={goNext}
        disabled={total === 0}
        title="Next match (Enter)"
      >
        ↓
      </button>
      <button
        className="diff-search-btn"
        onClick={close}
        title="Close (Esc)"
      >
        ×
      </button>
    </div>
  );
}
