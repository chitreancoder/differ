import { useStore } from "../state/store";
import { fetchRemote } from "../state/refresh";
import { isWorkingTree } from "../types";
import { CommitTimeline } from "./CommitTimeline";
import { SettingsMenu } from "./SettingsMenu";

export function TopBar() {
  const activeRepoPath = useStore((s) => s.activeRepoPath);
  const base = useStore((s) =>
    activeRepoPath ? s.base[activeRepoPath] ?? null : null,
  );
  const compare = useStore((s) =>
    activeRepoPath ? s.compare[activeRepoPath] ?? null : null,
  );
  const swapBranches = useStore((s) => s.swapBranches);
  const commentMode = useStore((s) => s.commentMode);
  const toggleCommentMode = useStore((s) => s.toggleCommentMode);
  const setBranchPickerKind = useStore((s) => s.setBranchPickerKind);
  const fetching = useStore((s) =>
    activeRepoPath ? !!s.fetchingRepos[activeRepoPath] : false,
  );
  const fileCount = useStore((s) => s.currentFiles.length);
  const reviewedCount = useStore((s) => s.reviewed.size);

  if (!activeRepoPath) {
    return (
      <header className="topbar">
        <span className="muted">Select a repository</span>
      </header>
    );
  }

  return (
    <header className="topbar">
      <button
        className={`btn-fetch ${fetching ? "fetching" : ""}`}
        onClick={() => fetchRemote(activeRepoPath)}
        disabled={fetching}
        title="Fetch from remote &amp; refresh (⌘R)"
      >
        <span className={`fetch-icon ${fetching ? "spinning" : ""}`}>↻</span>
        <span>{fetching ? "Fetching…" : "Fetch"}</span>
      </button>

      <div className="branch-slots">
        <button
          className="branch-slot"
          onClick={() => setBranchPickerKind("base")}
          title="Pick base branch"
        >
          <span className="muted">base</span>
          <span>{base ?? "—"}</span>
        </button>
        <button
          className="btn-icon"
          onClick={() => swapBranches(activeRepoPath)}
          disabled={!base || !compare || isWorkingTree(base) || isWorkingTree(compare)}
          title="Swap branches"
        >
          ⇄
        </button>
        <button
          className={`branch-slot ${isWorkingTree(compare) ? "working-tree" : ""}`}
          onClick={() => setBranchPickerKind("compare")}
          title="Pick compare branch"
        >
          <span className="muted">compare</span>
          <span>{isWorkingTree(compare) ? "working tree" : compare ?? "—"}</span>
        </button>
      </div>

      <CommitTimeline
        repoPath={activeRepoPath}
        base={base}
        compare={compare}
      />

      {fileCount > 0 && (
        <div className="topbar-progress" title={`${reviewedCount} of ${fileCount} files reviewed`}>
          <span className="topbar-progress-text">
            {reviewedCount}/{fileCount}
          </span>
          <div className="topbar-progress-track">
            <div
              className="topbar-progress-fill"
              style={{
                width: `${fileCount === 0 ? 0 : (reviewedCount / fileCount) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      <div className="topbar-tools">
        <button
          className={`btn-toggle btn-comment-mode ${commentMode ? "active" : ""}`}
          onClick={() => toggleCommentMode()}
          title="Toggle comment mode (c) — drag-select lines to leave a review note"
          aria-pressed={commentMode}
          aria-label="Toggle comment mode"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
        <SettingsMenu />
      </div>
    </header>
  );
}
