import { useStore } from "../state/store";

export function Sidebar() {
  const repos = useStore((s) => s.repos);
  const activeRepoPath = useStore((s) => s.activeRepoPath);
  const setActiveRepo = useStore((s) => s.setActiveRepo);
  const collapsed = useStore((s) => s.sidebarCollapsed);

  if (collapsed) return null;

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">Repositories</span>
        <button className="btn-icon" disabled title="Add repo (coming soon)">
          +
        </button>
      </div>

      {repos.length === 0 ? (
        <div className="sidebar-empty">
          <p>No repos yet.</p>
          <p className="muted">Add a repository to get started.</p>
        </div>
      ) : (
        <ul className="repo-list">
          {repos.map((r) => (
            <li
              key={r.path}
              className={`repo-item ${
                r.path === activeRepoPath ? "active" : ""
              }`}
              onClick={() => setActiveRepo(r.path)}
            >
              <div className="repo-name">{r.name}</div>
              <div className="repo-branch muted">
                {r.headBranch ?? "detached"}
              </div>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
