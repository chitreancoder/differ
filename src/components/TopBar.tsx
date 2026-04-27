import { useState } from "react";
import { useStore } from "../state/store";
import { BranchPickerModal } from "./BranchPickerModal";

type PickerKind = "base" | "compare" | null;

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
  const [picker, setPicker] = useState<PickerKind>(null);

  if (!activeRepoPath) {
    return (
      <header className="topbar">
        <button
          className="btn-icon"
          onClick={toggleSidebar}
          title="Toggle sidebar"
        >
          ☰
        </button>
        <span className="muted">Select a repository</span>
      </header>
    );
  }

  return (
    <>
      <header className="topbar">
        <button
          className="btn-icon"
          onClick={toggleSidebar}
          title="Toggle sidebar"
        >
          ☰
        </button>

        <div className="branch-slots">
          <button
            className="branch-slot"
            onClick={() => setPicker("base")}
            title="Pick base branch"
          >
            <span className="muted">base</span>
            <span>{base ?? "—"}</span>
          </button>
          <button
            className="btn-icon"
            onClick={() => swapBranches(activeRepoPath)}
            disabled={!base || !compare}
            title="Swap branches"
          >
            ⇄
          </button>
          <button
            className="branch-slot"
            onClick={() => setPicker("compare")}
            title="Pick compare branch"
          >
            <span className="muted">compare</span>
            <span>{compare ?? "—"}</span>
          </button>
        </div>

        <div className="topbar-spacer" />

        <div className="commit-timeline-placeholder muted">
          commits will appear here
        </div>

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
            title="Unified diff"
          >
            ☰
          </button>
        </div>
      </header>

      {picker && (
        <BranchPickerModal
          repoPath={activeRepoPath}
          kind={picker}
          onClose={() => setPicker(null)}
        />
      )}
    </>
  );
}
