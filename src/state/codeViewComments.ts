/** Pure derivation + signature helpers for review comments inside the
 *  CodeView. Side-mapping, snippet derivation, anchor check, Pierre's
 *  per-item version hashes, and the useCodeViewComments hook that produces
 *  `items` / `detached` / `fileNotesByFile` for the orchestrator. */
import { useMemo } from "react";
import type {
  CodeViewDiffItem,
  DiffLineAnnotation,
  FileDiffMetadata,
  SelectionSide,
} from "@pierre/diffs";
import type { ReviewComment } from "@/types";

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

export function toLibSide(side: "old" | "new"): SelectionSide {
  return side === "old" ? "deletions" : "additions";
}
export function fromLibSide(side: SelectionSide | undefined): "old" | "new" {
  return side === "deletions" ? "old" : "new";
}

/** Map a (side, line range) onto captured diff text by walking the hunks.
 *  Returns "" if no overlap (e.g. range gone after refresh). */
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

/** File notes are anchored while the file is present; line notes need the
 *  range to map into the current diff. */
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

/** Content signature for a file's annotations. Pierre's `item.version ===
 *  nextItem.version` check skips re-render — a plain count breaks when a
 *  draft (1 ann) turns into a saved comment (still 1 ann). Hashing
 *  id/body/sent/line catches the swap. */
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
  detached: ReviewComment[];
  detachedIds: Set<string>;
  fileNotesByFile: Map<string, ReviewComment[]>;
  items: CodeViewDiffItem<ReviewComment>[];
};

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
    // Group line-anchored comments + the live line draft per file. File-
    // level drafts/notes go in the header slot, not as Pierre annotations.
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
      // The transient composer carries an empty-id ReviewComment.
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
      // Combined version drives Pierre's per-item re-render gate.
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

    // Reorder to match the tree (folders-first, alphabetical). Git's patch
    // order doesn't match that sort.
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
