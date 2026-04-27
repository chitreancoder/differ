import { useStore } from "../state/store";
import { pickAndAddRepo } from "../state/repoActions";

export function Sidebar() {
  const repos = useStore((s) => s.repos);
  const activeRepoPath = useStore((s) => s.activeRepoPath);
  const setActiveRepo = useStore((s) => s.setActiveRepo);
  const removeRepo = useStore((s) => s.removeRepo);
  const collapsed = useStore((s) => s.sidebarCollapsed);

  if (collapsed) return null;

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">Repositories</span>
        <button
          className="btn-icon"
          onClick={pickAndAddRepo}
          title="Add repository"
        >
          +
        </button>
      </div>

      {repos.length === 0 ? (
        <div className="sidebar-empty">
          <p>No repos yet.</p>
          <p className="muted">
            Click <strong>+</strong> or drop a folder onto the window.
          </p>
        </div>
      ) : (
        <ul className="repo-list">
          {repos.map((r) => (
            <li
              key={r.path}
              className={`repo-item ${
                r.path === activeRepoPath ? "active" : ""
              } ${r.missing ? "missing" : ""}`}
              onClick={() => !r.missing && setActiveRepo(r.path)}
            >
              <div className="repo-row">
                <div className="repo-meta">
                  <div className="repo-name">{r.name}</div>
                  <div className="repo-branch muted">
                    {r.missing
                      ? "missing"
                      : (r.headBranch ?? "detached")}
                  </div>
                </div>
                <button
                  className="btn-icon repo-remove"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeRepo(r.path);
                  }}
                  title="Remove from list"
                >
                  ×
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
