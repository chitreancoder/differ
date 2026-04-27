import { useEffect, useRef } from "react";
import { useStore } from "../state/store";
import { useDiffFiles } from "../state/diff";
import { fetchRemote, refreshAll } from "../state/refresh";
import { FileTree } from "./FileTree";
import { DiffPane, type DiffPaneHandle } from "./DiffPane";

export function MainPane() {
  const repos = useStore((s) => s.repos);
  const activeRepoPath = useStore((s) => s.activeRepoPath);
  const base = useStore((s) =>
    activeRepoPath ? s.base[activeRepoPath] ?? null : null,
  );
  const compare = useStore((s) =>
    activeRepoPath ? s.compare[activeRepoPath] ?? null : null,
  );
  const selectedCommit = useStore((s) =>
    activeRepoPath ? s.selectedCommit[activeRepoPath] ?? null : null,
  );
  const diffStyle = useStore((s) => s.diffStyle);
  const currentFilePath = useStore((s) => s.currentFilePath);
  const setCurrentFilePath = useStore((s) => s.setCurrentFilePath);
  const setCurrentFiles = useStore((s) => s.setCurrentFiles);

  const { files, loading, error } = useDiffFiles(
    activeRepoPath,
    base,
    compare,
    selectedCommit,
  );

  const diffPaneRef = useRef<DiffPaneHandle>(null);

  useEffect(() => {
    setCurrentFilePath(null);
  }, [activeRepoPath, base, compare, selectedCommit, setCurrentFilePath]);

  useEffect(() => {
    setCurrentFiles(files);
  }, [files, setCurrentFiles]);

  if (repos.length === 0) {
    return (
      <main className="main-pane empty">
        <div className="empty-card">
          <h2>Welcome to Differ</h2>
          <p className="muted">
            Add a repository to start comparing branches.
          </p>
          <p className="muted hint">
            Tip: drop a folder anywhere in this window, or press{" "}
            <kbd>⌘K</kbd> for the command palette.
          </p>
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

  const activeRepo = repos.find((r) => r.path === activeRepoPath);
  if (activeRepo?.missing) {
    return (
      <main className="main-pane empty">
        <div className="empty-card">
          <h2>Repository unavailable</h2>
          <p className="muted">
            <code>{activeRepoPath}</code> can&apos;t be opened. It may have been
            moved or deleted.
          </p>
        </div>
      </main>
    );
  }

  if (!base || !compare) {
    return (
      <main className="main-pane empty">
        <div className="empty-card">
          <h2>Pick branches</h2>
          <p className="muted">
            Choose a <strong>base</strong> and <strong>compare</strong> branch
            in the top bar to view the cumulative diff.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="main-pane">
      <div className="file-tree-pane">
        <FileTree
          files={files}
          loading={loading}
          selectedPath={currentFilePath}
          onSelect={(path) => {
            setCurrentFilePath(path);
            diffPaneRef.current?.scrollToFile(path);
          }}
        />
      </div>
      <div className="diff-pane">
        {error ? (
          <div className="empty-card">
            <h2>Diff failed</h2>
            <p className="muted">{error}</p>
            <div className="empty-actions">
              <button
                className="btn-primary"
                onClick={() => fetchRemote(activeRepoPath)}
              >
                Fetch &amp; retry
              </button>
              <button className="btn-secondary" onClick={() => refreshAll()}>
                Retry without fetch
              </button>
            </div>
          </div>
        ) : loading && files.length === 0 ? (
          <div className="empty-card">
            <p className="muted">Loading diff…</p>
          </div>
        ) : !loading && files.length === 0 ? (
          <div className="empty-card">
            <h2>No changes</h2>
            <p className="muted">
              <code>{base}</code> and <code>{compare}</code> are identical.
            </p>
          </div>
        ) : (
          <DiffPane
            ref={diffPaneRef}
            files={files}
            repoPath={activeRepoPath}
            base={base}
            compare={compare}
            selectedCommit={selectedCommit}
            diffStyle={diffStyle}
            onVisibleFileChange={setCurrentFilePath}
          />
        )}
      </div>
    </main>
  );
}
