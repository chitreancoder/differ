import { useEffect, useRef } from "react";
import { useStore } from "../state/store";
import { useDiffFiles } from "../state/diff";
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

  if (!base || !compare) {
    return (
      <main className="main-pane empty">
        <div className="empty-card">
          <p className="muted">Pick base &amp; compare branches above.</p>
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
            <p className="muted">{error}</p>
          </div>
        ) : !loading && files.length === 0 ? (
          <div className="empty-card">
            <p className="muted">These branches are identical.</p>
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
