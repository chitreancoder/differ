import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { MainPane } from "./components/MainPane";
import { Toasts } from "./components/Toasts";
import { useSystemTheme } from "./theme";
import { loadPersisted, startPersistSubscription } from "./state/persist";
import { addRepoByPath } from "./state/repoActions";
import { useStore } from "./state/store";
import "./App.css";

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
  const [ready, setReady] = useState(false);

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
    </div>
  );
}

export default App;
