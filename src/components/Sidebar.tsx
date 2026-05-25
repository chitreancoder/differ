import { useStore } from "../state/store";
import { pickAndAddRepo } from "../state/repoActions";

export function Sidebar() {
  const repos = useStore((s) => s.repos);
  const activeRepoPath = useStore((s) => s.activeRepoPath);
  const setActiveRepo = useStore((s) => s.setActiveRepo);
  const removeRepo = useStore((s) => s.removeRepo);
  const collapsed = useStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useStore((s) => s.toggleSidebar);

  // Collapsed state still mounts a thin strip so users have a visible affordance
  // to re-open the panel (in addition to ⌘\). Empty path on the icon avoids
  // any "where did my sidebar go?" moments.
  if (collapsed) {
    return (
      <aside
        className="sidebar collapsed"
        aria-label="Repositories (collapsed)"
      >
        <button
          className="sidebar-expand"
          onClick={() => toggleSidebar()}
          title="Show repositories (⌘\\)"
          aria-label="Show repositories"
        >
          ›
        </button>
      </aside>
    );
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <button
          className="btn-icon sidebar-collapse"
          onClick={() => toggleSidebar()}
          title="Hide repositories (⌘\\)"
          aria-label="Hide repositories"
        >
          ☰
        </button>
        <span className="sidebar-title">Repositories</span>
        <span className="sidebar-header-spacer" />
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
