import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useCommits } from "../state/commits";
import { useStore } from "../state/store";
import { isWorkingTree, type Commit, type FileEntry } from "../types";
import { relativeTimeFromSeconds } from "../utils/time";
import { nameInitials } from "../utils/avatar";

const TOOLTIP_DELAY_MS = 200;
const TOOLTIP_WIDTH = 400;
const TOOLTIP_GAP = 8; // px between chip and tooltip
const VIEWPORT_MARGIN = 8; // px from window edges

type Props = {
  repoPath: string;
  base: string | null;
  compare: string | null;
};

type TooltipState = {
  commit: Commit;
  left: number;
  top: number;
  arrowLeft: number;
};

type CommitStats = {
  fileCount: number;
  additions: number;
  deletions: number;
  topFiles: { path: string; additions: number; deletions: number }[];
};

/**
 * Module-level cache for commit stats. Keyed by `${repoPath}|${sha}|${ws}` so a
 * single SHA on disk only ever costs one `diff_commit_name_status` invocation
 * per (repo, whitespace mode) — SHAs are immutable so the result is safe to
 * memoize for the life of the session.
 */
const statsCache = new Map<string, CommitStats>();

function statsKey(repoPath: string, sha: string, ignoreWhitespace: boolean) {
  return `${repoPath}|${sha}|${ignoreWhitespace ? 1 : 0}`;
}

async function fetchCommitStats(
  repoPath: string,
  sha: string,
  ignoreWhitespace: boolean,
): Promise<CommitStats> {
  const key = statsKey(repoPath, sha, ignoreWhitespace);
  const cached = statsCache.get(key);
  if (cached) return cached;
  const files = await invoke<FileEntry[]>("diff_commit_name_status", {
    path: repoPath,
    sha,
    ignoreWhitespace,
  });
  let additions = 0;
  let deletions = 0;
  for (const f of files) {
    additions += f.additions;
    deletions += f.deletions;
  }
  const topFiles = files
    .filter((f) => !f.isBinary)
    .slice()
    .sort(
      (a, b) =>
        b.additions + b.deletions - (a.additions + a.deletions),
    )
    .slice(0, 3)
    .map((f) => ({
      path: f.path,
      additions: f.additions,
      deletions: f.deletions,
    }));
  const stats: CommitStats = {
    fileCount: files.length,
    additions,
    deletions,
    topFiles,
  };
  statsCache.set(key, stats);
  return stats;
}

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
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
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
      const rect = target.getBoundingClientRect();
      // Clamp the tooltip's left so it stays on-screen, and place its arrow
      // under the chip's horizontal center (clamped inside the tooltip too).
      const chipCenterX = rect.left + rect.width / 2;
      const maxLeft =
        window.innerWidth - TOOLTIP_WIDTH - VIEWPORT_MARGIN;
      const left = Math.max(
        VIEWPORT_MARGIN,
        Math.min(maxLeft, chipCenterX - 60),
      );
      const arrowLeft = Math.max(
        18,
        Math.min(TOOLTIP_WIDTH - 18, chipCenterX - left),
      );
      setTooltip({
        commit,
        left,
        top: rect.bottom + TOOLTIP_GAP,
        arrowLeft,
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
      {tooltip && (
        <CommitTooltip
          commit={tooltip.commit}
          left={tooltip.left}
          top={tooltip.top}
          arrowLeft={tooltip.arrowLeft}
          repoPath={repoPath}
          ignoreWhitespace={ignoreWhitespace}
        />
      )}
    </>
  );
}

function CommitTooltip({
  commit,
  left,
  top,
  arrowLeft,
  repoPath,
  ignoreWhitespace,
}: {
  commit: Commit;
  left: number;
  top: number;
  arrowLeft: number;
  repoPath: string;
  ignoreWhitespace: boolean;
}) {
  const [stats, setStats] = useState<CommitStats | null>(
    () => statsCache.get(statsKey(repoPath, commit.sha, ignoreWhitespace)) ?? null,
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
    <div
      className="commit-tooltip"
      role="tooltip"
      style={{ left, top, width: TOOLTIP_WIDTH }}
    >
      <div className="commit-tooltip-arrow" style={{ left: arrowLeft }} />
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
    </div>
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
