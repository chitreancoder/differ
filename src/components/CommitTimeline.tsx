import { useEffect, useRef, useState } from "react";
import { useCommits } from "../state/commits";
import { useStore } from "../state/store";
import { isWorkingTree, type Commit } from "../types";

const TOOLTIP_DELAY_MS = 200;

type Props = {
  repoPath: string;
  base: string | null;
  compare: string | null;
};

type Tooltip = {
  commit: Commit;
  left: number;
  top: number;
};

export function CommitTimeline({ repoPath, base, compare }: Props) {
  const selectedCommit = useStore(
    (s) => s.selectedCommit[repoPath] ?? null,
  );
  const setSelectedCommit = useStore((s) => s.setSelectedCommit);
  const { commits, loading } = useCommits(repoPath, base, compare);
  const stripRef = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<number | null>(null);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);

  const showTooltip = (commit: Commit, target: HTMLElement) => {
    if (hoverTimer.current != null) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => {
      const rect = target.getBoundingClientRect();
      setTooltip({
        commit,
        left: rect.left + rect.width / 2,
        top: rect.bottom + 6,
      });
      hoverTimer.current = null;
    }, TOOLTIP_DELAY_MS);
  };
  const hideTooltip = () => {
    if (hoverTimer.current != null) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    setTooltip(null);
  };
  // Belt-and-suspenders: clear any pending timer on unmount.
  useEffect(
    () => () => {
      if (hoverTimer.current != null) window.clearTimeout(hoverTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (!selectedCommit) return;
    if (!commits.length) return;
    if (!commits.some((c) => c.sha === selectedCommit)) {
      setSelectedCommit(repoPath, null);
    }
  }, [commits, selectedCommit, repoPath, setSelectedCommit]);

  useEffect(() => {
    const el = stripRef.current;
    if (!el || !selectedCommit) return;
    const chip = el.querySelector<HTMLElement>(
      `[data-sha="${selectedCommit}"]`,
    );
    chip?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [selectedCommit]);

  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  if (!base || !compare) {
    return <div className="commit-timeline empty muted">—</div>;
  }

  if (isWorkingTree(compare)) {
    return (
      <div className="commit-timeline empty muted">
        Working tree vs <code>{base}</code>
      </div>
    );
  }

  if (loading && commits.length === 0) {
    return <div className="commit-timeline empty muted">Loading commits…</div>;
  }

  if (commits.length === 0) {
    return <div className="commit-timeline empty muted">No commits in range</div>;
  }

  // Scroll inside the strip while hovered should dismiss the tooltip — its
  // anchored screen position would otherwise drift away from the chip.
  return (
    <>
      <div
        className="commit-timeline"
        ref={stripRef}
        onScroll={hideTooltip}
        onPointerLeave={hideTooltip}
      >
        <button
          className={`commit-chip all ${selectedCommit === null ? "active" : ""}`}
          onClick={() => setSelectedCommit(repoPath, null)}
          title="Show cumulative branch diff"
        >
          All ({commits.length})
        </button>
        {commits.map((commit) => {
          const active = selectedCommit === commit.sha;
          return (
            <button
              key={commit.sha}
              data-sha={commit.sha}
              className={`commit-chip ${active ? "active" : ""} ${commit.isMerge ? "merge" : ""}`}
              onClick={() =>
                setSelectedCommit(repoPath, active ? null : commit.sha)
              }
              onPointerEnter={(e) => showTooltip(commit, e.currentTarget)}
              onPointerLeave={hideTooltip}
              aria-label={`${commit.shortSha} by ${commit.authorName}: ${commit.summary}`}
            >
              <span className="commit-sha">{commit.shortSha}</span>
              <span className="commit-summary">{commit.summary}</span>
            </button>
          );
        })}
      </div>
      {tooltip && (
        <div
          className="commit-tooltip"
          role="tooltip"
          style={{ left: tooltip.left, top: tooltip.top }}
        >
          <div className="commit-tooltip-head">
            <span className="commit-tooltip-sha">{tooltip.commit.shortSha}</span>
            <span className="commit-tooltip-author">
              {tooltip.commit.authorName}
            </span>
          </div>
          <div className="commit-tooltip-summary">{tooltip.commit.summary}</div>
        </div>
      )}
    </>
  );
}
