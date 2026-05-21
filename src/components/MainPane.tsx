import { useEffect, useMemo, useRef } from "react";
import { useStore } from "../state/store";
import { useDiffFiles, visibleFilePaths } from "../state/diff";
import { useFullDiff } from "../state/fullDiff";
import { fetchRemote, refreshAll } from "../state/refresh";
import { useSystemTheme } from "../theme";
import { FileTree } from "./FileTree";
import { CodeViewPane, type CodeViewPaneHandle } from "./CodeViewPane";

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
  const reviewed = useStore((s) => s.reviewed);
  const collapsedFolders = useStore((s) => s.collapsedFolders);
  const ensureReviewedScope = useStore((s) => s.ensureReviewedScope);
  const theme = useSystemTheme();
  const codeViewRef = useRef<CodeViewPaneHandle>(null);

  const scope = useMemo(
    () =>
      activeRepoPath && base && compare
        ? `${activeRepoPath}|${base}|${compare}|${selectedCommit ?? ""}`
        : null,
    [activeRepoPath, base, compare, selectedCommit],
  );

  const { files, loading, error } = useDiffFiles(
    activeRepoPath,
    base,
    compare,
    selectedCommit,
  );

  const {
    patch,
    loading: patchLoading,
    error: patchError,
  } = useFullDiff(activeRepoPath, base, compare, selectedCommit);

  const selectFile = (path: string) => {
    setCurrentFilePath(path);
    codeViewRef.current?.scrollToFile(path);
  };

  useEffect(() => {
    ensureReviewedScope(scope);
  }, [scope, ensureReviewedScope]);

  useEffect(() => {
    setCurrentFiles(files);
  }, [files, setCurrentFiles]);

  useEffect(() => {
    if (files.length === 0) {
      if (currentFilePath !== null) setCurrentFilePath(null);
      return;
    }
    const stillExists =
      currentFilePath !== null &&
      files.some((f) => f.path === currentFilePath);
    if (!stillExists) {
      const visible = visibleFilePaths(files, collapsedFolders);
      const first = visible[0] ?? files[0].path;
      setCurrentFilePath(first);
    }
  }, [files, currentFilePath, collapsedFolders, setCurrentFilePath]);

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

  const combinedError = error ?? patchError;

  return (
    <main className="main-pane">
      <div className="file-tree-pane">
        <FileTree
          files={files}
          loading={loading}
          selectedPath={currentFilePath}
          reviewed={reviewed}
          onSelect={selectFile}
        />
      </div>
      <div className="diff-pane">
        {combinedError ? (
          <div className="empty-card">
            <h2>Diff failed</h2>
            <p className="muted">{combinedError}</p>
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
        ) : (loading || patchLoading) && patch === null ? (
          <div className="empty-card">
            <p className="muted">Loading diff…</p>
          </div>
        ) : !loading && !patchLoading && files.length === 0 ? (
          <div className="empty-card">
            <h2>No changes</h2>
            <p className="muted">
              <code>{base}</code> and <code>{compare}</code> are identical.
            </p>
          </div>
        ) : patch !== null && scope ? (
          <CodeViewPane
            ref={codeViewRef}
            patch={patch}
            scopeKey={scope}
            diffStyle={diffStyle}
            theme={theme}
          />
        ) : (
          <div className="empty-card">
            <p className="muted">Loading diff…</p>
          </div>
        )}
      </div>
    </main>
  );
}
