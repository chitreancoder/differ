import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CodeView,
  WorkerPoolContextProvider,
  type CodeViewHandle,
} from "@pierre/diffs/react";
import {
  parsePatchFiles,
  type CodeViewDiffItem,
  type CodeViewLineSelection,
  type DiffLineAnnotation,
  type FileDiffMetadata,
  type SelectionSide,
} from "@pierre/diffs";
import type { DiffStyle, ReviewComment } from "../types";
import type { Theme } from "../theme";
import { poolOptions, highlighterOptions } from "../diffs/workerPool";
import { truncateSnippet } from "../state/review";

/**
 * Injected *into each file's Shadow DOM* via the `unsafeCSS` option — plain
 * App.css can't reach the header because it lives behind the shadow boundary.
 * Promoting the sticky header to its own compositor layer stops WKWebView
 * (Tauri/macOS) from repainting it out of sync with the scrolling code.
 */
const STICKY_HEADER_FIX =
  "[data-diffs-header][data-sticky]{will-change:transform;transform:translateZ(0)}";

export type CodeViewPaneHandle = {
  scrollToFile: (path: string) => void;
};

/** Our `"old"|"new"` model side maps onto the library's annotation sides. */
function toLibSide(side: "old" | "new"): SelectionSide {
  return side === "old" ? "deletions" : "additions";
}
function fromLibSide(side: SelectionSide | undefined): "old" | "new" {
  return side === "deletions" ? "old" : "new";
}

/**
 * Map a (side, line range) onto the captured diff text by walking the parsed
 * hunks. Within a hunk, file line numbers run contiguously from
 * `additionStart`/`deletionStart` and index contiguously from
 * `additionLineIndex`/`deletionLineIndex` into the flat line arrays. Returns
 * "" if no overlap is found (e.g. the range no longer exists after a refresh).
 */
function deriveSnippet(
  fileDiff: FileDiffMetadata,
  side: "old" | "new",
  start: number,
  end: number,
): string {
  const lines = side === "old" ? fileDiff.deletionLines : fileDiff.additionLines;
  const out: string[] = [];
  for (const hunk of fileDiff.hunks) {
    const hunkStart = side === "old" ? hunk.deletionStart : hunk.additionStart;
    const hunkCount = side === "old" ? hunk.deletionCount : hunk.additionCount;
    const hunkIndex =
      side === "old" ? hunk.deletionLineIndex : hunk.additionLineIndex;
    const hunkEnd = hunkStart + hunkCount - 1;
    const from = Math.max(start, hunkStart);
    const to = Math.min(end, hunkEnd);
    for (let ln = from; ln <= to; ln++) {
      const idx = hunkIndex + (ln - hunkStart);
      if (idx >= 0 && idx < lines.length) out.push(lines[idx]);
    }
  }
  return out.join("\n");
}

/**
 * A content signature for a file's annotations. CodeView skips re-rendering an
 * item when its `version` is unchanged (CodeView.js: `item.version ===
 * nextItem.version`), so a plain count breaks: a draft composer (1 annotation)
 * turning into a saved comment (1 annotation) keeps the count at 1 and the
 * stale composer stays. Hashing id/body/sent/line makes the version change
 * whenever the rendered content does.
 */
function annotationsVersion(
  anns: DiffLineAnnotation<ReviewComment>[] | undefined,
  revealedId: string | null,
): number {
  if (!anns || anns.length === 0) return 0;
  let h = 0;
  for (const a of anns) {
    const m = a.metadata;
    const revealed = m.id === revealedId ? 1 : 0;
    const sig = `${a.lineNumber}|${a.side}|${m.id}|${m.sent ? 1 : 0}|${revealed}|${m.body}`;
    for (let i = 0; i < sig.length; i++) {
      h = (Math.imul(h, 31) + sig.charCodeAt(i)) | 0;
    }
  }
  return h;
}

/** True if the comment's range still maps onto lines in the current diff. */
function rangeExists(
  fileDiff: FileDiffMetadata | undefined,
  c: ReviewComment,
): boolean {
  if (!fileDiff) return false;
  return deriveSnippet(fileDiff, c.range.side, c.range.start, c.range.end) !== "";
}

type Draft = {
  file: string;
  start: number;
  end: number;
  side: "old" | "new";
  snippet: string;
};

type Props = {
  patch: string;
  /** Stable per-comparison key — doubles as the worker-pool highlight cache prefix. */
  scopeKey: string;
  /** File paths in the order the tree shows them; the diff list is sorted to match. */
  fileOrder: string[];
  diffStyle: DiffStyle;
  theme: Theme;
  /** Whether drag-selecting lines opens a comment composer. */
  commentMode: boolean;
  /** Active-scope comments. */
  comments: ReviewComment[];
  /** Binary files can't be commented on. */
  binaryFiles: Set<string>;
  onAddComment: (c: ReviewComment) => void;
  onUpdateComment: (id: string, patch: Partial<ReviewComment>) => void;
  onRemoveComment: (id: string) => void;
};

export const CodeViewPane = forwardRef<CodeViewPaneHandle, Props>(
  function CodeViewPane(
    {
      patch,
      scopeKey,
      fileOrder,
      diffStyle,
      theme,
      commentMode,
      comments,
      binaryFiles,
      onAddComment,
      onUpdateComment,
      onRemoveComment,
    },
    ref,
  ) {
    const viewRef = useRef<CodeViewHandle<ReviewComment>>(null);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [selection, setSelection] = useState<CodeViewLineSelection | null>(
      null,
    );
    // When the current `selection` is a comment being revealed (vs. an arming
    // selection for a new comment), this holds that comment's id. It gates the
    // "Add comment" button off and lets the chip toggle/clear itself.
    const [revealedId, setRevealedId] = useState<string | null>(null);

    const fileDiffs = useMemo(() => {
      const parsed = parsePatchFiles(patch, scopeKey);
      const map = new Map<string, FileDiffMetadata>();
      for (const fileDiff of parsed.flatMap((p) => p.files)) {
        map.set(fileDiff.name, fileDiff);
      }
      return map;
    }, [patch, scopeKey]);

    // Comments whose range no longer maps onto the current diff. Surfaced in a
    // small "detached" list rather than mis-anchored inline.
    const detached = useMemo(
      () => comments.filter((c) => !rangeExists(fileDiffs.get(c.file), c)),
      [comments, fileDiffs],
    );
    const detachedIds = useMemo(
      () => new Set(detached.map((c) => c.id)),
      [detached],
    );

    const items = useMemo<CodeViewDiffItem<ReviewComment>[]>(() => {
      // Group anchored comments + the live draft into per-file annotations.
      const annByFile = new Map<string, DiffLineAnnotation<ReviewComment>[]>();
      const push = (file: string, ann: DiffLineAnnotation<ReviewComment>) => {
        const bucket = annByFile.get(file);
        if (bucket) bucket.push(ann);
        else annByFile.set(file, [ann]);
      };

      for (const c of comments) {
        if (detachedIds.has(c.id)) continue;
        push(c.file, {
          side: toLibSide(c.range.side),
          lineNumber: c.range.end,
          metadata: c,
        });
      }
      if (draft) {
        // A transient composer annotation carries an empty-id ReviewComment.
        push(draft.file, {
          side: toLibSide(draft.side),
          lineNumber: draft.end,
          metadata: {
            id: "",
            file: draft.file,
            range: { start: draft.start, end: draft.end, side: draft.side },
            snippet: draft.snippet,
            body: "",
            createdAt: 0,
            sent: false,
          },
        });
      }

      const all = [...fileDiffs.values()].map((fileDiff) => {
        const annotations = annByFile.get(fileDiff.name);
        return {
          id: fileDiff.name,
          type: "diff" as const,
          fileDiff,
          annotations,
          // Content hash (not count) so draft→saved and reveal toggles
          // re-render the item's annotations.
          version: annotationsVersion(annotations, revealedId),
        };
      });

      // Reorder to match the file tree (folders-first, alphabetical). Patch
      // order from git doesn't match the tree's sort. Unranked files keep
      // their relative order at the end (sort is stable).
      const rank = new Map(fileOrder.map((p, i) => [p, i]));
      return all.sort(
        (a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity),
      );
    }, [fileDiffs, comments, draft, detachedIds, fileOrder, revealedId]);

    useImperativeHandle(
      ref,
      () => ({
        scrollToFile(path: string) {
          viewRef.current?.scrollTo({
            type: "line",
            id: path,
            lineNumber: 1,
            align: "start",
          });
        },
      }),
      [],
    );

    const clearHighlight = () => {
      setSelection(null);
      setRevealedId(null);
      viewRef.current?.clearSelectedLines();
    };

    // Leaving comment mode clears any in-flight selection/draft/reveal.
    useEffect(() => {
      if (!commentMode) {
        setDraft(null);
        clearHighlight();
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [commentMode]);

    // A diff reload / branch / commit switch invalidates line numbers, so drop
    // any open draft or stale highlight.
    useEffect(() => {
      setDraft(null);
      clearHighlight();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [patch, scopeKey]);

    // Selecting lines only *arms* a range — it does NOT open the composer.
    // Opening it here would mount an annotation mid-gesture and prevent the
    // user from extending the selection (drag the gutter / shift-click). The
    // floating "Add comment" button below opens the composer for the whole
    // range, so a single line is just a range where start === end.
    const handleSelectedLinesChange = (
      sel: CodeViewLineSelection | null,
    ) => {
      if (!commentMode) return;
      setSelection(sel);
      // A fresh gutter selection is an arming selection, not a reveal.
      setRevealedId(null);
    };

    // The armed selection, normalized, if it can be commented on. A reveal
    // (revealedId set) is not armable — it must not show the "Add comment" CTA.
    const armed =
      commentMode && selection && !revealedId && !binaryFiles.has(selection.id)
        ? {
            file: selection.id,
            side: fromLibSide(selection.range.endSide ?? selection.range.side),
            start: Math.min(selection.range.start, selection.range.end),
            end: Math.max(selection.range.start, selection.range.end),
          }
        : null;
    const armedCount = armed ? armed.end - armed.start + 1 : 0;

    const startDraft = () => {
      if (!armed) return;
      const fileDiff = fileDiffs.get(armed.file);
      let snippet = fileDiff
        ? deriveSnippet(fileDiff, armed.side, armed.start, armed.end)
        : "";
      // Fall back to the native selection text if derivation came up empty.
      if (!snippet) snippet = window.getSelection()?.toString() ?? "";
      setDraft({ ...armed, snippet: truncateSnippet(snippet) });
    };

    const closeDraft = () => {
      setDraft(null);
      clearHighlight();
    };

    // Clicking a comment's location chip toggles a highlight of its lines
    // (Pierre's native, syntax-aware selection) and scrolls them into view —
    // works in or out of comment mode since the highlight reuses the selection
    // layer. Clicking the active chip again (or another chip) clears/switches.
    const revealComment = (c: ReviewComment) => {
      if (revealedId === c.id) {
        clearHighlight();
        return;
      }
      const libSide = toLibSide(c.range.side);
      const range = {
        start: c.range.start,
        end: c.range.end,
        side: libSide,
        endSide: libSide,
      };
      setSelection({ id: c.file, range });
      setRevealedId(c.id);
      viewRef.current?.scrollTo({
        type: "range",
        id: c.file,
        range,
        align: "center",
      });
    };

    // Deleting the comment whose lines are highlighted must drop the highlight.
    const deleteComment = (id: string) => {
      if (revealedId === id) clearHighlight();
      onRemoveComment(id);
    };

    const saveDraft = (body: string) => {
      if (!draft || !body.trim()) {
        closeDraft();
        return;
      }
      onAddComment({
        id: crypto.randomUUID(),
        file: draft.file,
        range: { start: draft.start, end: draft.end, side: draft.side },
        snippet: draft.snippet,
        body: body.trim(),
        createdAt: Date.now(),
        sent: false,
      });
      closeDraft();
    };

    const renderAnnotation = (
      annotation:
        | DiffLineAnnotation<ReviewComment>
        | { metadata?: ReviewComment },
    ) => {
      const meta = annotation.metadata;
      if (!meta) return null;
      // Empty id == the transient draft composer.
      if (meta.id === "") {
        return (
          <Composer comment={meta} onSave={saveDraft} onCancel={closeDraft} />
        );
      }
      return (
        <SavedComment
          comment={meta}
          onSave={(body) =>
            onUpdateComment(meta.id, {
              body,
              // Editing the note un-sends it.
              sent: body === meta.body ? meta.sent : false,
            })
          }
          onDelete={() => deleteComment(meta.id)}
          onReveal={() => revealComment(meta)}
          isRevealed={revealedId === meta.id}
        />
      );
    };

    return (
      <WorkerPoolContextProvider
        poolOptions={poolOptions}
        highlighterOptions={highlighterOptions}
      >
        <div
          className={`codeview-wrap ${commentMode ? "comment-mode" : ""}`}
          style={{ height: "100%" }}
        >
          {detached.length > 0 && (
            <DetachedComments
              comments={detached}
              onDelete={onRemoveComment}
            />
          )}
          {armed && !draft && (
            <button
              className="comment-add-fab"
              onMouseDown={(e) => e.preventDefault()}
              onClick={startDraft}
              title="Add a review comment for the selected lines"
            >
              💬 Comment on{" "}
              {armedCount === 1
                ? `line ${armed.start}`
                : `${armedCount} lines (${armed.start}–${armed.end})`}
            </button>
          )}
          <CodeView<ReviewComment>
            ref={viewRef}
            items={items}
            className="codeview"
            style={{ height: "100%" }}
            selectedLines={selection}
            onSelectedLinesChange={handleSelectedLinesChange}
            renderAnnotation={renderAnnotation}
            options={{
              diffStyle,
              themeType: theme,
              // Gate Pierre's gutter line-selection on comment mode; off, native
              // text selection/copy works normally. Without this the gutter is
              // inert and onSelectedLinesChange never fires.
              enableLineSelection: commentMode,
              // "scroll" keeps every row a uniform height so the virtualizer
              // knows exact offsets and skips post-render height reconciliation
              // — smoothest scrolling. Long lines scroll horizontally per file.
              overflow: "scroll",
              stickyHeaders: true,
              unsafeCSS: STICKY_HEADER_FIX,
            }}
          />
        </div>
      </WorkerPoolContextProvider>
    );
  },
);

/**
 * Compact chip naming the lines a comment is attached to. The code itself is
 * already visible right above, so we don't re-quote it — instead, clicking the
 * chip re-highlights those (real, syntax-colored) lines via `onReveal`.
 */
function CommentContext({
  range,
  onReveal,
  active = false,
}: {
  range: ReviewComment["range"];
  onReveal?: () => void;
  active?: boolean;
}) {
  const loc =
    range.start === range.end
      ? `Line ${range.start}`
      : `Lines ${range.start}–${range.end}`;
  const label = `${loc} · ${range.side === "old" ? "removed" : "added"}`;
  if (!onReveal) {
    return <span className="comment-loc-chip static">{label}</span>;
  }
  return (
    <button
      className={`comment-loc-chip ${active ? "active" : ""}`}
      onClick={onReveal}
      title={active ? "Clear highlight" : "Highlight these lines"}
    >
      {label}
    </button>
  );
}

function Composer({
  comment,
  onSave,
  onCancel,
}: {
  comment: ReviewComment;
  onSave: (body: string) => void;
  onCancel: () => void;
}) {
  const [body, setBody] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div className="comment-composer">
      <CommentContext range={comment.range} />
      <textarea
        ref={ref}
        className="comment-textarea"
        value={body}
        placeholder="Leave a note for Claude…"
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onSave(body);
          }
        }}
      />
      <div className="comment-actions">
        <button className="btn-primary btn-sm" onClick={() => onSave(body)}>
          Save
        </button>
        <button className="btn-secondary btn-sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function SavedComment({
  comment,
  onSave,
  onDelete,
  onReveal,
  isRevealed,
}: {
  comment: ReviewComment;
  onSave: (body: string) => void;
  onDelete: () => void;
  onReveal: () => void;
  isRevealed: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(comment.body);

  if (editing) {
    return (
      <div className="comment-composer">
        <textarea
          className="comment-textarea"
          value={body}
          autoFocus
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setBody(comment.body);
              setEditing(false);
            } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              onSave(body.trim());
              setEditing(false);
            }
          }}
        />
        <div className="comment-actions">
          <button
            className="btn-primary btn-sm"
            onClick={() => {
              onSave(body.trim());
              setEditing(false);
            }}
          >
            Save
          </button>
          <button
            className="btn-secondary btn-sm"
            onClick={() => {
              setBody(comment.body);
              setEditing(false);
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="comment-saved">
      <CommentContext
        range={comment.range}
        onReveal={onReveal}
        active={isRevealed}
      />
      <div className="comment-body">{comment.body}</div>
      <div className="comment-meta">
        {comment.sent && <span className="comment-sent">sent ✓</span>}
        <button className="comment-link" onClick={() => setEditing(true)}>
          edit
        </button>
        <button className="comment-link" onClick={onDelete}>
          delete
        </button>
      </div>
    </div>
  );
}

function DetachedComments({
  comments,
  onDelete,
}: {
  comments: ReviewComment[];
  onDelete: (id: string) => void;
}) {
  return (
    <div className="detached-comments">
      <div className="detached-title">
        Detached comments ({comments.length}) — the lines they referenced no
        longer exist in this diff. Still exported.
      </div>
      {comments.map((c) => (
        <div key={c.id} className="detached-item">
          <span className="detached-loc">
            {c.file}:{c.range.start}
            {c.range.end !== c.range.start ? `–${c.range.end}` : ""} (
            {c.range.side})
          </span>
          {c.snippet && (
            <pre className="comment-context-snippet">{c.snippet}</pre>
          )}
          <span className="detached-body">{c.body}</span>
          <button className="comment-link" onClick={() => onDelete(c.id)}>
            delete
          </button>
        </div>
      ))}
    </div>
  );
}
