import { useStore } from "../state/store";

export function MainPane() {
  const repos = useStore((s) => s.repos);
  const activeRepoPath = useStore((s) => s.activeRepoPath);

  if (repos.length === 0) {
    return (
      <main className="main-pane empty">
        <div className="empty-card">
          <h2>Welcome to Differ</h2>
          <p className="muted">Add a repository to start comparing branches.</p>
        </div>
      </main>
    );
  }

  if (!activeRepoPath) {
    return (
      <main className="main-pane empty">
        <div className="empty-card">
          <p className="muted">Select a repository from the sidebar.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="main-pane">
      <div className="file-tree-pane">
        <div className="muted padded">file tree</div>
      </div>
      <div className="diff-pane">
        <div className="empty-card">
          <p className="muted">Pick base &amp; compare branches above.</p>
        </div>
      </div>
    </main>
  );
}
