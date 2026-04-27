import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { MainPane } from "./components/MainPane";
import { Toasts } from "./components/Toasts";
import { CommandPalette } from "./components/CommandPalette";
import { BranchPickerModal } from "./components/BranchPickerModal";
import { useSystemTheme } from "./theme";
import { useShortcuts } from "./state/shortcuts";
import { loadPersisted, startPersistSubscription } from "./state/persist";
import { addRepoByPath } from "./state/repoActions";
import { autoFetchOnce, refreshAll } from "./state/refresh";
import { useStore } from "./state/store";
import "./App.css";

function useAutoFetchOnRepoSwitch() {
  const activeRepoPath = useStore((s) => s.activeRepoPath);
  const repos = useStore((s) => s.repos);
  useEffect(() => {
    if (!activeRepoPath) return;
    const repo = repos.find((r) => r.path === activeRepoPath);
    if (!repo || repo.missing) return;
    autoFetchOnce(activeRepoPath);
  }, [activeRepoPath, repos]);
}

function useFocusRefresh() {
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let lastBlurAt = 0;
    (async () => {
      unlisten = await getCurrentWindow().onFocusChanged((event) => {
        if (!event.payload) {
          lastBlurAt = Date.now();
          return;
        }
        if (Date.now() - lastBlurAt < 30_000) return;
        refreshAll();
      });
    })();
    return () => {
      unlisten?.();
    };
  }, []);
}

function useBranchDefaults() {
  const activeRepoPath = useStore((s) => s.activeRepoPath);
  const repos = useStore((s) => s.repos);
  useEffect(() => {
    if (!activeRepoPath) return;
    const repo = repos.find((r) => r.path === activeRepoPath);
    if (!repo || repo.missing) return;
    const { base, compare, setBase, setCompare } = useStore.getState();
    if (!base[activeRepoPath] && repo.defaultBranch) {
      setBase(activeRepoPath, repo.defaultBranch);
    }
    if (!compare[activeRepoPath] && repo.headBranch) {
      setCompare(activeRepoPath, repo.headBranch);
    }
  }, [activeRepoPath, repos]);
}

function App() {
  useSystemTheme();
  useBranchDefaults();
  useAutoFetchOnRepoSwitch();
  useFocusRefresh();
  useShortcuts();
  const [ready, setReady] = useState(false);
  const branchPickerKind = useStore((s) => s.branchPickerKind);
  const setBranchPickerKind = useStore((s) => s.setBranchPickerKind);
  const activeRepoPath = useStore((s) => s.activeRepoPath);

  useEffect(() => {
    let unsub: (() => void) | null = null;
    let unlisten: (() => void) | null = null;

    (async () => {
      await loadPersisted();
      unsub = startPersistSubscription();
      unlisten = await getCurrentWindow().onDragDropEvent((event) => {
        if (event.payload.type !== "drop") return;
        for (const path of event.payload.paths) {
          addRepoByPath(path);
        }
      });
      setReady(true);
    })();

    return () => {
      unsub?.();
      unlisten?.();
    };
  }, []);

  if (!ready) {
    return <div className="app-loading" />;
  }

  return (
    <div className="app">
      <Sidebar />
      <div className="workspace">
        <TopBar />
        <MainPane />
      </div>
      <Toasts />
      <CommandPalette />
      {branchPickerKind && activeRepoPath && (
        <BranchPickerModal
          repoPath={activeRepoPath}
          kind={branchPickerKind}
          onClose={() => setBranchPickerKind(null)}
        />
      )}
    </div>
  );
}

export default App;
