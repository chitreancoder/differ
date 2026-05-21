import { useStore } from "../state/store";
import { fetchRemote } from "../state/refresh";
import { isWorkingTree } from "../types";
import { CommitTimeline } from "./CommitTimeline";

export function TopBar() {
  const activeRepoPath = useStore((s) => s.activeRepoPath);
  const base = useStore((s) =>
    activeRepoPath ? s.base[activeRepoPath] ?? null : null,
  );
  const compare = useStore((s) =>
    activeRepoPath ? s.compare[activeRepoPath] ?? null : null,
  );
  const swapBranches = useStore((s) => s.swapBranches);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const diffStyle = useStore((s) => s.diffStyle);
  const setDiffStyle = useStore((s) => s.setDiffStyle);
  const setBranchPickerKind = useStore((s) => s.setBranchPickerKind);
  const fetching = useStore((s) =>
    activeRepoPath ? !!s.fetchingRepos[activeRepoPath] : false,
  );
  const fileCount = useStore((s) => s.currentFiles.length);
  const reviewedCount = useStore((s) => s.reviewed.size);

  if (!activeRepoPath) {
    return (
      <header className="topbar">
        <button
          className="btn-icon"
          onClick={toggleSidebar}
          title="Toggle sidebar (⌘\\)"
        >
          ☰
        </button>
        <span className="muted">Select a repository</span>
      </header>
    );
  }

  return (
    <header className="topbar">
      <button
        className="btn-icon"
        onClick={toggleSidebar}
        title="Toggle sidebar (⌘\\)"
      >
        ☰
      </button>

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
          className={`btn-toggle ${diffStyle === "split" ? "active" : ""}`}
          onClick={() => setDiffStyle("split")}
          title="Side-by-side diff"
        >
          ⇉
        </button>
        <button
          className={`btn-toggle ${diffStyle === "unified" ? "active" : ""}`}
          onClick={() => setDiffStyle("unified")}
          title="Unified diff (⌘L to toggle)"
        >
          ☰
        </button>
      </div>
    </header>
  );
}
