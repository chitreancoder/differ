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
  type CodeViewItem,
  type CodeViewLineSelection,
  type DiffLineAnnotation,
  type FileDiffMetadata,
} from "@pierre/diffs";
import type { DiffStyle, ReviewComment } from "@/types";
import type { Theme } from "@/theme";
import { poolOptions, highlighterOptions } from "@/diffs/workerPool";
import { truncateSnippet } from "@/state/review";
import { useStore } from "@/state/store";
import {
  deriveSnippet,
  fromLibSide,
  toLibSide,
  useCodeViewComments,
  type Draft,
} from "@/state/codeViewComments";
import { DiffSearch } from "@/components/DiffSearch";
import {
  Composer,
  DetachedComments,
  FileHeaderSlot,
  SavedComment,
} from "@/components/CodeViewCommentOverlay";
import { nameInitials } from "@/utils/avatar";

/**
 * CSS injected into each file's Shadow DOM via Pierre's `unsafeCSS` option —
 * plain App.css can't reach there.
 *
 *  - Sticky-header fix: promote the sticky header to its own compositor layer
 *    so WKWebView (Tauri/macOS) doesn't repaint it out of sync with scrolling.
 *  - Commented-dot: tiny gutter marker stamped by `onPostRender` for every
 *    line with a comment. `light-dark()` keeps it readable in both themes.
 */
function shadowCSS(commentMode: boolean): string {
  return [
    "[data-diffs-header][data-sticky]{will-change:transform;transform:translateZ(0)}",
    "[data-column-number]{position:relative}",
    ".commented-dot{position:absolute;left:2px;top:50%;transform:translateY(-50%);" +
      "width:6px;height:6px;border-radius:50%;" +
      "background:light-dark(#d97706,#f59e0b);" +
      "cursor:pointer;z-index:1}",
    // In comment mode, body lines respond to click — hint with a pointer.
    commentMode ? "[data-code] [data-line-index]{cursor:pointer}" : "",
  ].join("");
}

/**
 * Stamp a small dot in the line-number gutter for every line with a line-
 * anchored comment. Called per-file from Pierre's `onPostRender`. Idempotent
 * (clears any residual `.commented-dot` first) in case Pierre re-uses the
 * gutter element across renders.
 */
function stampCommentedDots(
  node: HTMLElement,
  instance: unknown,
  comments: ReviewComment[],
  detachedIds: Set<string>,
  diffStyle: DiffStyle,
  revealComment: (c: ReviewComment) => void,
): void {
  // `fileDiff` is `protected` on FileDiff — cast through unknown to read it.
  const fileName = (instance as { fileDiff?: { name?: string } }).fileDiff?.name;
  if (!fileName) return;
  const root = node.shadowRoot;
  if (!root) return;

  root.querySelectorAll(".commented-dot").forEach((d) => d.remove());

  const fileComments = comments.filter(
    (c) => c.file === fileName && c.range && !detachedIds.has(c.id),
  );
  if (fileComments.length === 0) return;

  for (const c of fileComments) {
    if (!c.range) continue;
    const libSide = toLibSide(c.range.side);
    // Split view: target the correct side. Unified collapses sides into one
    // gutter — match by line number alone.
    const sideSel =
      diffStyle === "unified"
        ? "[data-unified]"
        : libSide === "deletions"
          ? "[data-deletions]"
          : "[data-additions]";
    for (let line = c.range.start; line <= c.range.end; line++) {
      const cells = root.querySelectorAll(
        `${sideSel} [data-gutter] [data-column-number="${line}"]`,
      );
      cells.forEach((cell) => {
        if ((cell as HTMLElement).querySelector(":scope > .commented-dot"))
          return;
        const dot = document.createElement("span");
        dot.className = "commented-dot";
        dot.title = "Commented — click to highlight";
        dot.addEventListener("click", (e) => {
          e.stopPropagation();
          revealComment(c);
        });
        (cell as HTMLElement).appendChild(dot);
      });
    }
  }
}

export type CodeViewPanelHandle = {
  scrollToFile: (path: string) => void;
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
  /** `git config user.name` for the active repo. Drives the reviewer avatar
   *  and display name on comment cards. Null falls back to "You" / "ME". */
  authorName: string | null;
  onAddComment: (c: ReviewComment) => void;
  onUpdateComment: (id: string, patch: Partial<ReviewComment>) => void;
  onRemoveComment: (id: string) => void;
  /** Fires when the file at the top of the diff viewport changes. Lets the
   *  parent sync the file tree's highlight to wherever scrolling lands. */
  onVisibleFileChange?: (path: string) => void;
};

export const CodeViewPanel = forwardRef<CodeViewPanelHandle, Props>(
  function CodeViewPanel(
    {
      patch,
      scopeKey,
      fileOrder,
      diffStyle,
      theme,
      commentMode,
      comments,
      binaryFiles,
      authorName,
      onAddComment,
      onUpdateComment,
      onRemoveComment,
      onVisibleFileChange,
    },
    ref,
  ) {
    const viewRef = useRef<CodeViewHandle<ReviewComment>>(null);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [selection, setSelection] = useState<CodeViewLineSelection | null>(
      null,
    );
    // Holds the id of the comment whose lines are currently highlighted by a
    // reveal (vs. an arming selection for a new comment). Gates the "Add
    // comment" CTA off and lets the chip toggle/clear itself.
    const [revealedId, setRevealedId] = useState<string | null>(null);

    const fileDiffs = useMemo(() => {
      const parsed = parsePatchFiles(patch, scopeKey);
      const map = new Map<string, FileDiffMetadata>();
      for (const fileDiff of parsed.flatMap((p) => p.files)) {
        map.set(fileDiff.name, fileDiff);
      }
      return map;
    }, [patch, scopeKey]);

    // Stable CSS string — Pierre compares unsafeCSS by identity to decide
    // whether to re-inject into each file's shadow DOM.
    const unsafeCSS = useMemo(() => shadowCSS(commentMode), [commentMode]);

    const { detached, detachedIds, fileNotesByFile, items } =
      useCodeViewComments(
        comments,
        fileDiffs,
        draft,
        revealedId,
        commentMode,
        fileOrder,
      );

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

    // RAF-throttled scroll handler: figure out which file's header is anchored
    // at the top of the viewport and notify the parent so the file tree's
    // highlight follows the diff. Pierre fires onScroll a lot — without the
    // RAF gate we'd churn the store on every wheel tick.
    const scrollFrame = useRef<number | null>(null);
    const lastVisibleFile = useRef<string | null>(null);
    const itemsRef = useRef(items);
    itemsRef.current = items;
    const onVisibleFileChangeRef = useRef(onVisibleFileChange);
    onVisibleFileChangeRef.current = onVisibleFileChange;
    useEffect(
      () => () => {
        if (scrollFrame.current != null)
          cancelAnimationFrame(scrollFrame.current);
      },
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

    // A diff reload / branch / commit switch invalidates line numbers, so
    // drop any open draft or stale highlight. Also close the search overlay
    // since its match indices point at the previous patch.
    useEffect(() => {
      setDraft(null);
      clearHighlight();
      useStore.getState().setSearchOpen(false);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [patch, scopeKey]);

    // Selecting lines only *arms* a range — it does NOT open the composer.
    // Opening it here would mount an annotation mid-gesture and prevent the
    // user from extending the selection. The floating "Add comment" button
    // below opens the composer for the whole range.
    const handleSelectedLinesChange = (
      sel: CodeViewLineSelection | null,
    ) => {
      if (!commentMode) return;
      setSelection(sel);
      setRevealedId(null);
    };

    // The armed selection, normalized, if it can be commented on. A reveal
    // (revealedId set) is not armable — must not show the "Add comment" CTA.
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
    // (Pierre's native, syntax-aware selection) and scrolls them into view.
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

    // Author display + avatar derived from the active repo's git user.name.
    // Falls back to "You" / "ME" when no name is configured.
    const authorDisplay = authorName ?? "You";
    const authorAvatar = authorName ? nameInitials(authorName) : "ME";

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
          authorDisplay={authorDisplay}
          authorAvatar={authorAvatar}
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
          authorDisplay={authorDisplay}
          authorAvatar={authorAvatar}
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
          <DiffSearch
            fileDiffs={fileDiffs}
            fileOrder={fileOrder}
            viewRef={viewRef}
          />
          <CodeView<ReviewComment>
            ref={viewRef}
            items={items}
            className="codeview"
            style={{ height: "100%" }}
            selectedLines={selection}
            onSelectedLinesChange={handleSelectedLinesChange}
            renderAnnotation={renderAnnotation}
            renderHeaderMetadata={renderHeaderMetadata}
            onScroll={(scrollTop, viewer) => {
              const cb = onVisibleFileChangeRef.current;
              if (!cb) return;
              if (scrollFrame.current != null) return;
              scrollFrame.current = requestAnimationFrame(() => {
                scrollFrame.current = null;
                // Find the item whose top offset is the largest value
                // satisfying `top <= scrollTop` — that's the file whose
                // sticky header is currently anchored at the viewport top.
                let bestId: string | null = null;
                let bestTop = -Infinity;
                const cutoff = scrollTop + 1;
                for (const item of itemsRef.current) {
                  const top = viewer.getTopForItem(item.id);
                  if (top == null) continue;
                  if (top <= cutoff && top > bestTop) {
                    bestTop = top;
                    bestId = item.id;
                  }
                }
                if (bestId && bestId !== lastVisibleFile.current) {
                  lastVisibleFile.current = bestId;
                  cb(bestId);
                }
              });
            }}
            options={{
              diffStyle,
              themeType: theme,
              onLineClick: (props, ctx) => {
                // Only intercept body clicks while comment mode is on. The
                // gutter has its own selection mechanism (enableLineSelection)
                // so we leave numberColumn clicks alone.
                if (!commentMode) return;
                if (props.numberColumn) return;
                if (!ctx || ctx.type !== "diff") return;
                if (!("annotationSide" in props)) return;
                const file = ctx.item.id;
                const libSide = props.annotationSide;
                const line = props.lineNumber;
                const existing = selection;
                if (
                  props.event.shiftKey &&
                  existing &&
                  existing.id === file
                ) {
                  // Shift+click: extend from the existing anchor to the
                  // clicked line. Allow crossing sides via endSide.
                  setSelection({
                    id: file,
                    range: {
                      start: existing.range.start,
                      end: line,
                      side: existing.range.side,
                      endSide: libSide,
                    },
                  });
                } else {
                  // Plain click: start a 1-line selection on this side.
                  setSelection({
                    id: file,
                    range: {
                      start: line,
                      end: line,
                      side: libSide,
                      endSide: libSide,
                    },
                  });
                }
                setRevealedId(null);
                // Don't preventDefault — keep native text selection working.
              },
              // Gate Pierre's gutter line-selection on comment mode; off,
              // native text selection/copy works normally.
              enableLineSelection: commentMode,
              // "scroll" keeps every row a uniform height so the virtualizer
              // knows exact offsets and skips post-render height reconciliation.
              overflow: "scroll",
              stickyHeaders: true,
              unsafeCSS,
              onPostRender: (node, instance) => {
                stampCommentedDots(
                  node,
                  instance,
                  comments,
                  detachedIds,
                  diffStyle,
                  revealComment,
                );
              },
            }}
          />
        </div>
      </WorkerPoolContextProvider>
    );
  },
);
