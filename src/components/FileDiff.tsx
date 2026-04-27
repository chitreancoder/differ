import { useEffect, useRef, useState } from "react";
import { DiffView, DiffModeEnum } from "@git-diff-view/react";
import "@git-diff-view/react/styles/diff-view.css";
import type { DiffHighlighter } from "@git-diff-view/shiki";
import type { FileEntry, DiffStyle } from "../types";
import { useDiffText } from "../state/diffText";
import { getHighlighter } from "../state/highlighter";
import { useSystemTheme } from "../theme";
import { fileAnchorId, isTooLarge, langFromPath } from "../utils/diff";
import { DiffViewBoundary } from "./DiffViewBoundary";

type Props = {
  file: FileEntry;
  repoPath: string;
  base: string;
  compare: string;
  selectedCommit: string | null;
  diffStyle: DiffStyle;
  onVisible: (path: string) => void;
};

function statusLabel(file: FileEntry): string {
  switch (file.status.kind) {
    case "added":
      return "Added";
    case "modified":
      return "Modified";
    case "deleted":
      return "Deleted";
    case "renamed":
      return `Renamed from ${file.status.from}`;
    case "copied":
      return `Copied from ${file.status.from}`;
    case "typeChanged":
      return "Type changed";
    case "unmerged":
      return "Unmerged";
    case "unknown":
      return "Changed";
  }
}

export function FileDiff({
  file,
  repoPath,
  base,
  compare,
  selectedCommit,
  diffStyle,
  onVisible,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tooLarge = isTooLarge(file);
  const [expanded, setExpanded] = useState(!tooLarge);
  const [inViewport, setInViewport] = useState(false);
  const [highlighter, setHighlighter] = useState<DiffHighlighter | null>(null);
  const theme = useSystemTheme();

  const shouldFetch =
    expanded && !file.isBinary && !tooLarge && inViewport;

  useEffect(() => {
    if (!shouldFetch) return;
    let cancelled = false;
    getHighlighter().then((h) => {
      if (!cancelled) setHighlighter(h);
    });
    return () => {
      cancelled = true;
    };
  }, [shouldFetch]);

  const { diffText, loading, error } = useDiffText(
    repoPath,
    base,
    compare,
    selectedCommit,
    file.path,
    shouldFetch,
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const loadObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setInViewport(true);
      },
      { rootMargin: "300px 0px" },
    );
    loadObserver.observe(el);
    const visibilityObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) onVisible(file.path);
      },
      { rootMargin: "0px 0px -70% 0px", threshold: 0 },
    );
    visibilityObserver.observe(el);
    return () => {
      loadObserver.disconnect();
      visibilityObserver.disconnect();
    };
  }, [file.path, onVisible]);

  const hasHunks = diffText !== null && diffText.includes("\n@@");
  const lang = langFromPath(file.path);

  return (
    <div
      ref={containerRef}
      id={fileAnchorId(file.path)}
      className="file-diff"
    >
      <div className="file-diff-header">
        <span className="file-diff-status">{statusLabel(file)}</span>
        <span className="file-diff-path">{file.path}</span>
        {!file.isBinary &&
          (file.additions > 0 || file.deletions > 0) && (
            <span className="file-diff-counts">
              <span className="counts-add">+{file.additions}</span>
              <span className="counts-del">−{file.deletions}</span>
            </span>
          )}
        <button
          className="btn-icon file-diff-toggle"
          onClick={() => setExpanded((v) => !v)}
          title={expanded ? "Collapse" : "Expand"}
          disabled={tooLarge}
        >
          {expanded ? "▾" : "▸"}
        </button>
      </div>

      {!expanded && (
        <div className="file-diff-collapsed muted">
          {tooLarge
            ? `Diff too large (${file.additions + file.deletions} lines). Open externally.`
            : "Collapsed. Click ▸ to expand."}
        </div>
      )}

      {expanded && file.isBinary && (
        <div className="file-diff-binary muted">Binary file — no preview</div>
      )}

      {expanded && !file.isBinary && !tooLarge && (
        <div className="file-diff-body">
          {loading && (
            <div className="file-diff-loading muted">Loading diff…</div>
          )}
          {error && <div className="file-diff-error">{error}</div>}
          {diffText !== null && !hasHunks && (
            <div className="file-diff-empty muted">
              No textual changes (rename or mode change only).
            </div>
          )}
          {diffText !== null && hasHunks && (
            <DiffViewBoundary
              diffKey={`${file.path}|${selectedCommit ?? "all"}|${diffStyle}`}
            >
              <DiffView
                data={{
                  oldFile: { fileName: file.path, fileLang: lang },
                  newFile: { fileName: file.path, fileLang: lang },
                  hunks: [diffText],
                }}
                diffViewMode={
                  diffStyle === "split"
                    ? DiffModeEnum.Split
                    : DiffModeEnum.Unified
                }
                diffViewWrap
                diffViewHighlight={highlighter !== null}
                diffViewTheme={theme}
                registerHighlighter={highlighter ?? undefined}
                diffViewFontSize={12}
              />
            </DiffViewBoundary>
          )}
        </div>
      )}
    </div>
  );
}
