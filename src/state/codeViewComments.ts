/**
 * Pure derivation + signature helpers for review comments as the CodeView
 * sees them. Lives outside the component so it stays trivially testable and
 * the orchestrator file (CodeViewPanel.tsx) only has to think about
 * interactions, not annotation bookkeeping.
 *
 * What lives here:
 *  - side-mapping between our model and Pierre's `SelectionSide`
 *  - snippet derivation from (file, side, range) → captured text
 *  - "is this comment still anchored?" check
 *  - content-hash version generators that drive Pierre's per-item
 *    re-render gate
 *  - `useCodeViewComments` hook that derives the `items` Pierre needs,
 *    the detached list, the file-level-note buckets, and the detached-id
 *    set, all from (comments, fileDiffs, draft, ...) inputs
 */
import { useMemo } from "react";
import type {
  CodeViewDiffItem,
  DiffLineAnnotation,
  FileDiffMetadata,
  SelectionSide,
} from "@pierre/diffs";
import type { ReviewComment } from "@/types";

/** A pending comment draft — either anchored to a line range or to a whole file. */
export type Draft =
  | {
      kind: "line";
      file: string;
      start: number;
      end: number;
      side: "old" | "new";
      snippet: string;
    }
  | { kind: "file"; file: string };

/** Our `"old" | "new"` model side maps onto the library's annotation sides. */
export function toLibSide(side: "old" | "new"): SelectionSide {
  return side === "old" ? "deletions" : "additions";
}
export function fromLibSide(side: SelectionSide | undefined): "old" | "new" {
  return side === "deletions" ? "old" : "new";
}

/**
 * Map a (side, line range) onto the captured diff text by walking the parsed
 * hunks. Within a hunk, file line numbers run contiguously from
 * `additionStart`/`deletionStart` and index contiguously from
 * `additionLineIndex`/`deletionLineIndex` into the flat line arrays. Returns
 * "" if no overlap is found (e.g. the range no longer exists after a refresh).
 */
export function deriveSnippet(
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

/** File-level notes are anchored as long as the file is present; line notes
 *  are anchored as long as their line range maps into the current diff. */
export function commentAnchored(
  fileDiff: FileDiffMetadata | undefined,
  c: ReviewComment,
): boolean {
  if (!fileDiff) return false;
  if (!c.range) return true;
  return (
    deriveSnippet(fileDiff, c.range.side, c.range.start, c.range.end) !== ""
  );
}

/**
 * A content signature for a file's line annotations. CodeView skips
 * re-rendering an item when its `version` is unchanged (CodeView.js:
 * `item.version === nextItem.version`), so a plain count breaks: a draft
 * composer (1 annotation) turning into a saved comment (1 annotation)
 * keeps the count at 1 and the stale composer stays. Hashing id / body /
 * sent / line makes the version change whenever the rendered content does.
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

/** Bumps when anything that affects a file's header slot changes. */
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

export type DerivedComments = {
  /** Comments whose anchor is gone — file deleted or line range no longer maps. */
  detached: ReviewComment[];
  detachedIds: Set<string>;
  /** File-level notes (no range), bucketed by file path. */
  fileNotesByFile: Map<string, ReviewComment[]>;
  /** The full Pierre item list, sorted to match `fileOrder`, each with a
   *  content-hashed `version` that drives the per-item re-render gate. */
  items: CodeViewDiffItem<ReviewComment>[];
};

/**
 * Single hook that produces everything CodeViewPanel needs to feed Pierre:
 * detached comments, file-level note buckets, and the item array with
 * line annotations baked in (including the transient draft composer if any).
 */
export function useCodeViewComments(
  comments: ReviewComment[],
  fileDiffs: Map<string, FileDiffMetadata>,
  draft: Draft | null,
  revealedId: string | null,
  commentMode: boolean,
  fileOrder: string[],
): DerivedComments {
  const detached = useMemo(
    () => comments.filter((c) => !commentAnchored(fileDiffs.get(c.file), c)),
    [comments, fileDiffs],
  );
  const detachedIds = useMemo(
    () => new Set(detached.map((c) => c.id)),
    [detached],
  );

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
      if (!c.range) continue;
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
    // order from git doesn't match the tree's sort. Stable sort keeps
    // unranked files at the end in their relative order.
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

  return { detached, detachedIds, fileNotesByFile, items };
}
