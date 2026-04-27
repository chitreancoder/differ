import { useEffect, useRef } from "react";
import { useCommits } from "../state/commits";
import { useStore } from "../state/store";

type Props = {
  repoPath: string;
  base: string | null;
  compare: string | null;
};

export function CommitTimeline({ repoPath, base, compare }: Props) {
  const selectedCommit = useStore(
    (s) => s.selectedCommit[repoPath] ?? null,
  );
  const setSelectedCommit = useStore((s) => s.setSelectedCommit);
  const { commits, loading } = useCommits(repoPath, base, compare);
  const stripRef = useRef<HTMLDivElement>(null);

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

  if (loading && commits.length === 0) {
    return <div className="commit-timeline empty muted">Loading commits…</div>;
  }

  if (commits.length === 0) {
    return <div className="commit-timeline empty muted">No commits in range</div>;
  }

  return (
    <div className="commit-timeline" ref={stripRef}>
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
            title={`${commit.shortSha} · ${commit.authorName}\n${commit.summary}`}
          >
            <span className="commit-sha">{commit.shortSha}</span>
            <span className="commit-summary">{commit.summary}</span>
          </button>
        );
      })}
    </div>
  );
}
