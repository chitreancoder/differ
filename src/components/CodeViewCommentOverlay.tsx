import { useEffect, useRef, useState } from "react";
import type { ReviewComment } from "@/types";
import { relativeTimeFromMs } from "@/utils/time";

/** Visual chrome for review comments inside Pierre's CodeView. All
 *  behavior is driven via callback props — no store/Pierre coupling. */

/** "Line 42" / "File note" chip naming where a comment is attached. */
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

export function Composer({
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

export function SavedComment({
  comment,
  authorDisplay,
  authorAvatar,
  onSave,
  onDelete,
  onReveal,
  isRevealed,
}: {
  comment: ReviewComment;
  authorDisplay: string;
  authorAvatar: string;
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
      <div className="comment-saved-header">
        <span className="comment-avatar">{authorAvatar}</span>
        <span className="comment-author">{authorDisplay}</span>
        <span className="comment-time">
          · {relativeTimeFromMs(comment.createdAt)} ago
        </span>
        <span className="comment-saved-spacer" />
        <CommentContext
          range={comment.range}
          onReveal={onReveal}
          active={isRevealed}
        />
      </div>
      <div className="comment-body">{comment.body}</div>
      <div className="comment-meta">
        <button className="comment-link" onClick={() => setEditing(true)}>
          Edit
        </button>
        <button className="comment-link" onClick={onDelete}>
          Delete
        </button>
        <span className="comment-saved-spacer" />
        {comment.sent && <span className="comment-sent">sent ✓</span>}
      </div>
    </div>
  );
}

export function DetachedComments({
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

/** Per-file header widget injected via Pierre's `renderHeaderMetadata`. */
export function FileHeaderSlot({
  notes,
  commentMode,
  drafting,
  authorDisplay,
  authorAvatar,
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
  authorDisplay: string;
  authorAvatar: string;
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
          authorDisplay={authorDisplay}
          authorAvatar={authorAvatar}
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
  authorDisplay,
  authorAvatar,
  onSave,
  onDelete,
  onReveal,
  isRevealed,
}: {
  comment: ReviewComment;
  authorDisplay: string;
  authorAvatar: string;
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
      <div className="comment-saved-header">
        <span className="comment-avatar">{authorAvatar}</span>
        <span className="comment-author">{authorDisplay}</span>
        <span className="comment-time">
          · {relativeTimeFromMs(comment.createdAt)} ago
        </span>
        <span className="comment-saved-spacer" />
        <CommentContext onReveal={onReveal} active={isRevealed} />
      </div>
      <div className="comment-body">{comment.body}</div>
      <div className="comment-meta">
        <button className="comment-link" onClick={() => setEditing(true)}>
          Edit
        </button>
        <button className="comment-link" onClick={onDelete}>
          Delete
        </button>
        <span className="comment-saved-spacer" />
        {comment.sent && <span className="comment-sent">sent ✓</span>}
      </div>
    </div>
  );
}
