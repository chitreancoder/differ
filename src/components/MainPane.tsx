import { useCallback, useEffect, useMemo, useRef } from "react";
import { useStore } from "../state/store";
import { useDiffFiles, visibleFilePaths } from "../state/diff";
import { useFullDiff } from "../state/fullDiff";
import { fetchRemote, refreshAll } from "../state/refresh";
import { useEffectiveTheme } from "../theme";
import { FileTree } from "./FileTree";
import { CodeViewPane, type CodeViewPaneHandle } from "./CodeViewPane";
import { Welcome } from "./Welcome";

const NO_COLLAPSE = new Set<string>();

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
  const commentMode = useStore((s) => s.commentMode);
  const allComments = useStore((s) => s.comments);
  const addComment = useStore((s) => s.addComment);
  const updateComment = useStore((s) => s.updateComment);
  const removeComment = useStore((s) => s.removeComment);
  const treeWidth = useStore((s) => s.treeWidth);
  const setTreeWidth = useStore((s) => s.setTreeWidth);
  const theme = useEffectiveTheme();
  const codeViewRef = useRef<CodeViewPaneHandle>(null);
  const mainRef = useRef<HTMLElement>(null);

  const startResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = treeWidth;
      const onMove = (ev: MouseEvent) => {
        setTreeWidth(startW + (ev.clientX - startX));
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        document.body.classList.remove("resizing-col");
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      document.body.classList.add("resizing-col");
    },
    [treeWidth, setTreeWidth],
  );

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

  const fileOrder = useMemo(
    () => visibleFilePaths(files, NO_COLLAPSE),
    [files],
  );

  const scopeComments = useMemo(
    () => (scope ? allComments[scope] ?? [] : []),
    [scope, allComments],
  );

  const binaryFiles = useMemo(
    () => new Set(files.filter((f) => f.isBinary).map((f) => f.path)),
    [files],
  );

  const commentedFiles = useMemo(
    () => new Set(scopeComments.map((c) => c.file)),
    [scopeComments],
  );

  // The latest file the *diff viewport* reported as anchored at its top —
  // used to break the would-be feedback loop with the useEffect below.
  const lastReportedVisibleFile = useRef<string | null>(null);
  const handleVisibleFileChange = useCallback(
    (path: string) => {
      lastReportedVisibleFile.current = path;
      setCurrentFilePath(path);
    },
    [setCurrentFilePath],
  );

  const selectFile = (path: string) => {
    // Just update the path — the effect below will drive the scroll.
    setCurrentFilePath(path);
  };

  useEffect(() => {
    ensureReviewedScope(scope);
  }, [scope, ensureReviewedScope]);

  // When currentFilePath changes (j/k, tree click, palette jump, …) scroll
  // the diff to that file — unless the change *came from* a diff-scroll
  // (onVisibleFileChange), in which case we're already there.
  useEffect(() => {
    if (!currentFilePath) return;
    if (lastReportedVisibleFile.current === currentFilePath) return;
    codeViewRef.current?.scrollToFile(currentFilePath);
  }, [currentFilePath]);

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
        <Welcome />
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
    <main
      className="main-pane"
      ref={mainRef}
      style={{ gridTemplateColumns: `${treeWidth}px 1fr` }}
    >
      <div className="file-tree-pane">
        <FileTree
          files={files}
          loading={loading}
          selectedPath={currentFilePath}
          reviewed={reviewed}
          commentedFiles={commentedFiles}
          onSelect={selectFile}
        />
      </div>
      <div
        className="col-resizer"
        role="separator"
        aria-orientation="vertical"
        onMouseDown={startResize}
        onDoubleClick={() => setTreeWidth(280)}
        title="Drag to resize · double-click to reset"
        style={{ left: `${treeWidth}px` }}
      />
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
            fileOrder={fileOrder}
            diffStyle={diffStyle}
            theme={theme}
            commentMode={commentMode}
            comments={scopeComments}
            binaryFiles={binaryFiles}
            authorName={activeRepo?.userName ?? null}
            onAddComment={(c) => addComment(scope, c)}
            onUpdateComment={(id, patch) => updateComment(scope, id, patch)}
            onRemoveComment={(id) => removeComment(scope, id)}
            onVisibleFileChange={handleVisibleFileChange}
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
