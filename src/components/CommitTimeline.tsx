import { useEffect, useRef, useState } from "react";
import { useCommits } from "@/state/commits";
import {
  fetchCommitStats,
  peekCommitStats,
  type CommitStats,
} from "@/state/commitStats";
import { useStore } from "@/state/store";
import { Popover } from "@/components/Popover";
import { isWorkingTree, type Commit } from "@/types";
import { relativeTimeFromSeconds } from "@/utils/time";
import { nameInitials } from "@/utils/avatar";

const TOOLTIP_DELAY_MS = 200;
const TOOLTIP_WIDTH = 400;

type Props = {
  repoPath: string;
  base: string | null;
  compare: string | null;
};

function formatNumber(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
}

export function CommitTimeline({ repoPath, base, compare }: Props) {
  const selectedCommit = useStore(
    (s) => s.selectedCommit[repoPath] ?? null,
  );
  const setSelectedCommit = useStore((s) => s.setSelectedCommit);
  const ignoreWhitespace = useStore((s) => s.ignoreWhitespace);
  const { commits, loading } = useCommits(repoPath, base, compare);
  const stripRef = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<number | null>(null);
  // The Popover anchors against this ref; we mutate `.current` whenever the
  // user hovers a different chip, and re-render with a `placementKey` so the
  // Popover recomputes its viewport position.
  const hoveredChipRef = useRef<HTMLElement | null>(null);
  const [hovered, setHovered] = useState<Commit | null>(null);
  // Local filter — case-insensitive substring across sha + message + author.
  // Reset whenever the comparison changes so a stale query doesn't hide every
  // commit in the new range.
  const [filter, setFilter] = useState("");
  useEffect(() => {
    setFilter("");
  }, [repoPath, base, compare]);
  const trimmed = filter.trim().toLowerCase();
  const visibleCommits = trimmed
    ? commits.filter(
        (c) =>
          c.sha.toLowerCase().includes(trimmed) ||
          c.shortSha.toLowerCase().includes(trimmed) ||
          c.summary.toLowerCase().includes(trimmed) ||
          c.authorName.toLowerCase().includes(trimmed),
      )
    : commits;

  const showTooltip = (commit: Commit, target: HTMLElement) => {
    if (hoverTimer.current != null) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => {
      hoveredChipRef.current = target;
      setHovered(commit);
      hoverTimer.current = null;
    }, TOOLTIP_DELAY_MS);
  };
  const hideTooltip = () => {
    if (hoverTimer.current != null) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    hoveredChipRef.current = null;
    setHovered(null);
  };
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

  return (
    <>
      <div
        className="commit-timeline"
        ref={stripRef}
        onScroll={hideTooltip}
        onPointerLeave={hideTooltip}
      >
        <div className="commit-filter">
          <input
            type="text"
            className="commit-filter-input"
            placeholder="Filter commits…"
            value={filter}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && filter) {
                e.stopPropagation();
                setFilter("");
              }
            }}
          />
          {filter && (
            <button
              className="commit-filter-clear"
              onClick={() => setFilter("")}
              title="Clear filter"
              aria-label="Clear filter"
            >
              ×
            </button>
          )}
        </div>
        <button
          className={`commit-chip all ${selectedCommit === null ? "active" : ""}`}
          onClick={() => setSelectedCommit(repoPath, null)}
          title="Show cumulative branch diff"
        >
          All ({trimmed ? `${visibleCommits.length}/${commits.length}` : commits.length})
        </button>
        {visibleCommits.length === 0 && trimmed && (
          <span className="commit-filter-empty muted">No matches</span>
        )}
        {visibleCommits.map((commit) => {
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
      <Popover
        open={!!hovered}
        triggerRef={hoveredChipRef}
        placementKey={hovered?.sha ?? null}
        onClose={hideTooltip}
        width={TOOLTIP_WIDTH}
        showArrow
        dismissOnOutsideClick={false}
        dismissOnEscape={false}
        role="tooltip"
        className="commit-tooltip"
      >
        {hovered && (
          <CommitTooltipBody
            commit={hovered}
            repoPath={repoPath}
            ignoreWhitespace={ignoreWhitespace}
          />
        )}
      </Popover>
    </>
  );
}

/**
 * Render-only body for the hovered-commit tooltip. Positioning and the arrow
 * live in <Popover>; this just composes the header / stats / top-files.
 */
function CommitTooltipBody({
  commit,
  repoPath,
  ignoreWhitespace,
}: {
  commit: Commit;
  repoPath: string;
  ignoreWhitespace: boolean;
}) {
  const [stats, setStats] = useState<CommitStats | null>(
    () => peekCommitStats(repoPath, commit.sha, ignoreWhitespace),
  );

  useEffect(() => {
    if (stats) return;
    let cancelled = false;
    fetchCommitStats(repoPath, commit.sha, ignoreWhitespace)
      .then((s) => {
        if (!cancelled) setStats(s);
      })
      .catch(() => {
        /* tooltip just stays in loading state — not worth a toast */
      });
    return () => {
      cancelled = true;
    };
  }, [commit.sha, repoPath, ignoreWhitespace, stats]);

  return (
    <>
      <div className="commit-tooltip-header">
        <span className="commit-tooltip-sha-pill">{commit.shortSha}</span>
        <span className="commit-tooltip-dot">·</span>
        <span className="commit-tooltip-avatar">
          {nameInitials(commit.authorName)}
        </span>
        <span className="commit-tooltip-author">{commit.authorName}</span>
        <span className="commit-tooltip-spacer" />
        <span className="commit-tooltip-time">
          {relativeTimeFromSeconds(commit.timestamp)}
        </span>
      </div>
      <div className="commit-tooltip-subject">{commit.summary}</div>
      <div className="commit-tooltip-stats">
        <Stat
          label="FILES"
          value={stats ? String(stats.fileCount) : "—"}
        />
        <Stat
          label="ADDED"
          value={stats ? `+${formatNumber(stats.additions)}` : "—"}
          tone="added"
        />
        <Stat
          label="REMOVED"
          value={stats ? `−${formatNumber(stats.deletions)}` : "—"}
          tone="removed"
        />
      </div>
      {stats && stats.topFiles.length > 0 && (
        <div className="commit-tooltip-topfiles">
          <div className="commit-tooltip-topfiles-label">TOP FILES</div>
          {stats.topFiles.map((f) => (
            <div key={f.path} className="commit-tooltip-topfile">
              <span className="commit-tooltip-topfile-path" title={f.path}>
                {f.path}
              </span>
              {f.additions > 0 && (
                <span className="commit-tooltip-topfile-add">
                  +{f.additions}
                </span>
              )}
              {f.deletions > 0 && (
                <span className="commit-tooltip-topfile-del">
                  −{f.deletions}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "added" | "removed";
}) {
  return (
    <div className="commit-tooltip-stat">
      <div className="commit-tooltip-stat-label">{label}</div>
      <div className={`commit-tooltip-stat-val ${tone ?? ""}`}>{value}</div>
    </div>
  );
}
