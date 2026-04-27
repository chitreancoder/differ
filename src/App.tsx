import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { MainPane } from "./components/MainPane";
import { Toasts } from "./components/Toasts";
import { useSystemTheme } from "./theme";
import { loadPersisted, startPersistSubscription } from "./state/persist";
import { addRepoByPath } from "./state/repoActions";
import "./App.css";

function App() {
  useSystemTheme();
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
