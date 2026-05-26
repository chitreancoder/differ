import { useStore } from "@/state/store";
import { useRepoSelection } from "@/state/selection";
import { exportForClaude } from "@/state/review";
import type { ReviewComment } from "@/types";
import "./StatusBar.css";

// Stable empty reference: returning a fresh `[]` from a useStore selector makes
// useSyncExternalStore see a new snapshot every render → infinite update loop.
const EMPTY_COMMENTS: ReviewComment[] = [];

function Kbd({ children }: { children: React.ReactNode }) {
  return <span className="statusbar-kbd">{children}</span>;
}

export function StatusBar() {
  const files = useStore((s) => s.currentFiles);
  const currentFilePath = useStore((s) => s.currentFilePath);
  const diffStyle = useStore((s) => s.diffStyle);
  const toggleShortcuts = useStore((s) => s.toggleShortcuts);
  const commentMode = useStore((s) => s.commentMode);
  const activeRepoPath = useStore((s) => s.activeRepoPath);
  const { scope } = useRepoSelection(activeRepoPath);
  const scopeComments =
    useStore((s) => (scope ? s.comments[scope] : undefined)) ?? EMPTY_COMMENTS;

  const handleExport = async () => {
    const store = useStore.getState();
    if (!scope || !activeRepoPath || scopeComments.length === 0) return;
    const repo = store.repos.find((r) => r.path === activeRepoPath);
    const repoName = repo?.name ?? activeRepoPath;
    try {
      await exportForClaude(activeRepoPath, scopeComments);
      store.markCommentsSent(
        scope,
        scopeComments.map((c) => c.id),
      );
      store.pushToast(
        `Copied review for ${repoName} + wrote .differ/review.md`,
        "info",
      );
    } catch (e) {
      store.pushToast(`Export failed: ${e}`, "error");
    }
  };

  if (files.length === 0) return null;

  const idx = currentFilePath
    ? files.findIndex((f) => f.path === currentFilePath)
    : -1;
  const position = idx >= 0 ? idx + 1 : "—";

  return (
    <div className="statusbar">
      <span className="statusbar-pos">
        {position}/{files.length}
      </span>
      <span className="statusbar-hint">
        <Kbd>j</Kbd> <Kbd>k</Kbd> nav
      </span>
      <span className="statusbar-hint">
        <Kbd>x</Kbd> review
      </span>
      <span className="statusbar-hint">
        <Kbd>n</Kbd> next unread
      </span>
      <span className="statusbar-hint">
        <Kbd>d</Kbd> {diffStyle === "split" ? "unified" : "split"}
      </span>
      <span className="statusbar-hint">
        <Kbd>⌘P</Kbd> jump
      </span>
      <button
        className="statusbar-hint statusbar-help"
        onClick={() => toggleShortcuts()}
        title="Show all shortcuts"
      >
        <Kbd>?</Kbd> shortcuts
      </button>
      <span className="statusbar-hint">
        <Kbd>c</Kbd> comment
      </span>
      <span className="statusbar-spacer" />
      {scopeComments.length > 0 && (
        <button
          className="statusbar-export"
          onClick={handleExport}
          title="Copy a review prompt for Claude & write .differ/review.md"
        >
          {scopeComments.length} comment
          {scopeComments.length === 1 ? "" : "s"} · Export for Claude
        </button>
      )}
      {commentMode && <span className="statusbar-comment-active">comment mode</span>}
      <span className="statusbar-mode">
        {diffStyle === "split" ? "split" : "inline"}
      </span>
    </div>
  );
}
