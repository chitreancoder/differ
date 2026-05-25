import { lazy, Suspense, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { MainPanel } from "@/components/MainPanel";
import { Toasts } from "@/components/Toasts";
import { StatusBar } from "@/components/StatusBar";
import { useEffectiveTheme } from "@/theme";
import { useShortcuts } from "@/state/shortcuts";
import { loadPersisted, startPersistSubscription } from "@/state/persist";
import { addRepoByPath } from "@/state/repoActions";
import { autoFetchOnce, refreshAll } from "@/state/refresh";
import { useStore } from "@/state/store";
import "@/App.css";

// Three modal overlays that the user only sees after an explicit gesture
// (⌘K, ?, branch slot click). Lazy-loaded so cmdk + the bigger modal
// machinery doesn't sit in the initial bundle for users who never open them.
const CommandPalette = lazy(() =>
  import("@/components/CommandPalette").then((m) => ({
    default: m.CommandPalette,
  })),
);
const ShortcutsModal = lazy(() =>
  import("@/components/ShortcutsModal").then((m) => ({
    default: m.ShortcutsModal,
  })),
);
const BranchPickerModal = lazy(() =>
  import("@/components/BranchPickerModal").then((m) => ({
    default: m.BranchPickerModal,
  })),
);

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
    let lastBlurAt = Date.now();
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
  useEffectiveTheme();
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
        <MainPanel />
        <StatusBar />
      </div>
      <Toasts />
      <CommandPaletteSlot />
      <ShortcutsModalSlot />
      {branchPickerKind && activeRepoPath && (
        <Suspense fallback={null}>
          <BranchPickerModal
            repoPath={activeRepoPath}
            kind={branchPickerKind}
            onClose={() => setBranchPickerKind(null)}
          />
        </Suspense>
      )}
    </div>
  );
}

/** Mount the palette chunk only when it's open — the component itself reads
 *  paletteOpen from the store, but we gate mounting here so the lazy import
 *  is deferred until first ⌘K. */
function CommandPaletteSlot() {
  const open = useStore((s) => s.paletteOpen);
  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <CommandPalette />
    </Suspense>
  );
}

function ShortcutsModalSlot() {
  const open = useStore((s) => s.shortcutsOpen);
  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <ShortcutsModal />
    </Suspense>
  );
}

export default App;
