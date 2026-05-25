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
  type CodeViewItem,
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

/**
 * Bumps when anything that affects a file's header slot changes (file-level
 * notes for that file, the global commentMode toggle, or a file-level draft
 * being open for that file). Folded into the item's `version` so Pierre
 * re-runs `renderHeaderMetadata`.
 */
function fileHeaderVersion(
  fileNotes: ReviewComment[],
  commentMode: boolean,
  draftActive: boolean,
): number {
  let h = (commentMode ? 1 : 0) * 31 + (draftActive ? 2 : 0);
  for (const c of fileNotes) {
    const sig = `${c.id}|${c.sent ? 1 : 0}|${c.body}`;
    for (let i = 0; i < sig.length; i++) {
      h = (Math.imul(h, 31) + sig.charCodeAt(i)) | 0;
    }
  }
  return h;
}

/** True if the comment is still anchored: a file-level note as long as the
 *  file is present, a line note as long as its line range maps into the diff. */
function commentAnchored(
  fileDiff: FileDiffMetadata | undefined,
  c: ReviewComment,
): boolean {
  if (!fileDiff) return false;
  if (!c.range) return true; // file-level note: anchored by file existing
  return deriveSnippet(fileDiff, c.range.side, c.range.start, c.range.end) !== "";
}

type Draft =
  | {
      kind: "line";
      file: string;
      start: number;
      end: number;
      side: "old" | "new";
      snippet: string;
    }
  | { kind: "file"; file: string };

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

    // Comments no longer anchored: file gone, or (for line notes) range no
    // longer mapping. File-level notes survive any in-file change.
    const detached = useMemo(
      () => comments.filter((c) => !commentAnchored(fileDiffs.get(c.file), c)),
      [comments, fileDiffs],
    );
    const detachedIds = useMemo(
      () => new Set(detached.map((c) => c.id)),
      [detached],
    );

    // File-level notes (no range), bucketed by file for fast header lookup.
    const fileNotesByFile = useMemo(() => {
      const m = new Map<string, ReviewComment[]>();
      for (const c of comments) {
        if (c.range || detachedIds.has(c.id)) continue;
        const bucket = m.get(c.file);
        if (bucket) bucket.push(c);
        else m.set(c.file, [c]);
      }
      return m;
    }, [comments, detachedIds]);

    const items = useMemo<CodeViewDiffItem<ReviewComment>[]>(() => {
      // Group line-anchored comments + the live line draft into per-file
      // annotations. File-level notes / drafts are rendered in the file's
      // header metadata slot, not as Pierre annotations.
      const annByFile = new Map<string, DiffLineAnnotation<ReviewComment>[]>();
      const push = (file: string, ann: DiffLineAnnotation<ReviewComment>) => {
        const bucket = annByFile.get(file);
        if (bucket) bucket.push(ann);
        else annByFile.set(file, [ann]);
      };

      for (const c of comments) {
        if (detachedIds.has(c.id)) continue;
        if (!c.range) continue; // file-level → header slot
        push(c.file, {
          side: toLibSide(c.range.side),
          lineNumber: c.range.end,
          metadata: c,
        });
      }
      if (draft && draft.kind === "line") {
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
        const fileNotes = fileNotesByFile.get(fileDiff.name) ?? [];
        const fileDraftActive =
          draft?.kind === "file" && draft.file === fileDiff.name;
        // Combined version: line annotations + file-header slot. Either kind
        // of content change has to bump this so Pierre re-renders the item.
        const aV = annotationsVersion(annotations, revealedId);
        const fV = fileHeaderVersion(fileNotes, commentMode, fileDraftActive);
        return {
          id: fileDiff.name,
          type: "diff" as const,
          fileDiff,
          annotations,
          version: (Math.imul(aV, 31) + fV) | 0,
        };
      });

      // Reorder to match the file tree (folders-first, alphabetical). Patch
      // order from git doesn't match the tree's sort. Unranked files keep
      // their relative order at the end (sort is stable).
      const rank = new Map(fileOrder.map((p, i) => [p, i]));
      return all.sort(
        (a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity),
      );
    }, [
      fileDiffs,
      comments,
      draft,
      detachedIds,
      fileOrder,
      revealedId,
      fileNotesByFile,
      commentMode,
    ]);

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
      setDraft({ kind: "line", ...armed, snippet: truncateSnippet(snippet) });
    };

    const startFileDraft = (file: string) => {
      setDraft({ kind: "file", file });
      // A file-level draft isn't a line selection; clear any armed range so
      // the floating FAB disappears.
      setSelection(null);
      setRevealedId(null);
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
      // File-level note: no line range to highlight — just scroll to the file.
      if (!c.range) {
        setSelection(null);
        setRevealedId(c.id);
        viewRef.current?.scrollTo({
          type: "line",
          id: c.file,
          lineNumber: 1,
          align: "start",
        });
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
      if (draft.kind === "line") {
        onAddComment({
          id: crypto.randomUUID(),
          file: draft.file,
          range: { start: draft.start, end: draft.end, side: draft.side },
          snippet: draft.snippet,
          body: body.trim(),
          createdAt: Date.now(),
          sent: false,
        });
      } else {
        onAddComment({
          id: crypto.randomUUID(),
          file: draft.file,
          body: body.trim(),
          createdAt: Date.now(),
          sent: false,
        });
      }
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

    const renderHeaderMetadata = (item: CodeViewItem<ReviewComment>) => {
      if (item.type !== "diff") return null;
      const path = item.fileDiff.name;
      const notes = fileNotesByFile.get(path) ?? [];
      const fileDraftActive = draft?.kind === "file" && draft.file === path;
      // Show nothing if there's no commentMode and no existing notes — keeps
      // the header tidy on most files.
      if (!commentMode && notes.length === 0) return null;
      return (
        <FileHeaderSlot
          notes={notes}
          commentMode={commentMode}
          drafting={fileDraftActive}
          onAdd={() => startFileDraft(path)}
          onSaveDraft={saveDraft}
          onCancelDraft={closeDraft}
          onEdit={(id, body, prev) =>
            onUpdateComment(id, {
              body,
              sent: body === prev.body ? prev.sent : false,
            })
          }
          onDelete={deleteComment}
          revealedId={revealedId}
          onReveal={revealComment}
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
            renderHeaderMetadata={renderHeaderMetadata}
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
 * Compact chip naming where a comment is attached. For line notes, clicking
 * highlights those lines (Pierre's native, syntax-aware selection). For
 * file-level notes, clicking scrolls to the top of the file.
 */
function CommentContext({
  range,
  onReveal,
  active = false,
}: {
  range?: ReviewComment["range"];
  onReveal?: () => void;
  active?: boolean;
}) {
  if (!range) {
    if (!onReveal) {
      return (
        <span className="comment-loc-chip static file-level">File note</span>
      );
    }
    return (
      <button
        className={`comment-loc-chip file-level ${active ? "active" : ""}`}
        onClick={onReveal}
        title="Scroll to file"
      >
        File note
      </button>
    );
  }
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
        Detached comments ({comments.length}) — the file or lines they
        referenced no longer exist in this diff. Still exported.
      </div>
      {comments.map((c) => (
        <div key={c.id} className="detached-item">
          <span className="detached-loc">
            {c.file}
            {c.range
              ? `:${c.range.start}${
                  c.range.end !== c.range.start ? `–${c.range.end}` : ""
                } (${c.range.side})`
              : " (file-level)"}
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

/**
 * Per-file widget injected into Pierre's file header via `renderHeaderMetadata`.
 * Shows existing file-level notes inline, an "+ Add file note" button when
 * in comment mode, and the composer when a file-level draft is active for
 * this file.
 */
function FileHeaderSlot({
  notes,
  commentMode,
  drafting,
  onAdd,
  onSaveDraft,
  onCancelDraft,
  onEdit,
  onDelete,
  revealedId,
  onReveal,
}: {
  notes: ReviewComment[];
  commentMode: boolean;
  drafting: boolean;
  onAdd: () => void;
  onSaveDraft: (body: string) => void;
  onCancelDraft: () => void;
  onEdit: (id: string, body: string, prev: ReviewComment) => void;
  onDelete: (id: string) => void;
  revealedId: string | null;
  onReveal: (c: ReviewComment) => void;
}) {
  return (
    <div className="file-header-slot">
      {notes.map((c) => (
        <FileLevelNote
          key={c.id}
          comment={c}
          onSave={(body) => onEdit(c.id, body, c)}
          onDelete={() => onDelete(c.id)}
          onReveal={() => onReveal(c)}
          isRevealed={revealedId === c.id}
        />
      ))}
      {drafting && (
        <FileLevelComposer onSave={onSaveDraft} onCancel={onCancelDraft} />
      )}
      {commentMode && !drafting && (
        <button
          className="file-note-add"
          onClick={onAdd}
          title="Add a comment about this whole file"
        >
          + File note
        </button>
      )}
    </div>
  );
}

function FileLevelComposer({
  onSave,
  onCancel,
}: {
  onSave: (body: string) => void;
  onCancel: () => void;
}) {
  const [body, setBody] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div className="comment-composer file-level">
      <CommentContext />
      <textarea
        ref={ref}
        className="comment-textarea"
        value={body}
        placeholder="A note about this whole file…"
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

function FileLevelNote({
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
      <div className="comment-composer file-level">
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
    <div className="comment-saved file-level">
      <CommentContext onReveal={onReveal} active={isRevealed} />
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
