import { useMemo, useState, useEffect, useRef } from "react";
import { Modal } from "./Modal";
import { useBranches } from "../state/branches";
import { useStore } from "../state/store";
import type { Branch } from "../types";

type Props = {
  repoPath: string;
  kind: "base" | "compare";
  onClose: () => void;
};

function score(branch: Branch, query: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const n = branch.name.toLowerCase();
  if (n === q) return 1000;
  if (n.startsWith(q)) return 500;
  if (n.includes(q)) return 100;
  // letters in order (loose subsequence)
  let i = 0;
  for (const ch of n) {
    if (ch === q[i]) i++;
    if (i === q.length) return 50;
  }
  return 0;
}

export function BranchPickerModal({ repoPath, kind, onClose }: Props) {
  const { branches, loading } = useBranches(repoPath);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const setBase = useStore((s) => s.setBase);
  const setCompare = useStore((s) => s.setCompare);

  const filtered = useMemo(() => {
    return branches
      .map((b) => ({ b, s: score(b, query) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => {
        if (b.s !== a.s) return b.s - a.s;
        // prefer local over remote at same score
        if (a.b.isRemote !== b.b.isRemote) return a.b.isRemote ? 1 : -1;
        return a.b.name.localeCompare(b.b.name);
      })
      .map((x) => x.b);
  }, [branches, query]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const select = (b: Branch) => {
    if (kind === "base") setBase(repoPath, b.name);
    else setCompare(repoPath, b.name);
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const b = filtered[activeIdx];
      if (b) select(b);
    }
  };

  return (
    <Modal onClose={onClose}>
      <div className="picker">
        <div className="picker-header">
          <span className="picker-label muted">{kind}</span>
          <input
            ref={inputRef}
            className="picker-input"
            placeholder={`Pick ${kind} branch…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>
        <ul className="picker-list">
          {loading && filtered.length === 0 && (
            <li className="picker-empty muted">Loading branches…</li>
          )}
          {!loading && filtered.length === 0 && (
            <li className="picker-empty muted">No matches</li>
          )}
          {filtered.map((b, i) => (
            <li
              key={`${b.isRemote ? "r" : "l"}:${b.name}`}
              className={`picker-item ${i === activeIdx ? "active" : ""} ${
                b.isRemote ? "remote" : "local"
              }`}
              onMouseEnter={() => setActiveIdx(i)}
              onClick={() => select(b)}
            >
              <span className="picker-item-name">{b.name}</span>
              <span className="picker-item-tag muted">
                {b.isRemote ? "remote" : b.isHead ? "HEAD" : "local"}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
