import { lazy, Suspense, useState } from "react";
import { pickAndAddRepo } from "@/state/repoActions";
import iconUrl from "@/assets/icon.png";

// Lazy: the clone modal pulls in @tauri-apps/plugin-dialog + listen, neither
// of which the typical first-launch user touches.
const CloneModal = lazy(() => import("@/components/CloneModal"));

/**
 * First-run / no-repos landing screen. Communicates what Differ is (one
 * sentence), surfaces the two real entry points (pick a local repo, clone a
 * URL), makes the existing window-wide drop affordance visible, and teases a
 * couple of keyboard shortcuts so users start finding them.
 */
export function Welcome() {
  const [cloning, setCloning] = useState(false);
  return (
    <div className="welcome">
      <div className="welcome-card">
        <img
          className="welcome-icon"
          src={iconUrl}
          alt=""
          aria-hidden="true"
          draggable={false}
        />
        <h1 className="welcome-title">Differ</h1>
        <p className="welcome-tagline">
          Review branch diffs before they hit a PR — and feed your notes
          straight back to Claude Code.
        </p>

        <div className="welcome-actions">
          <button
            className="btn-primary welcome-primary"
            onClick={() => pickAndAddRepo()}
          >
            <span aria-hidden="true">+</span> Add repository
          </button>
          <button
            className="btn-secondary"
            onClick={() => setCloning(true)}
          >
            Clone from URL…
          </button>
        </div>

        <div className="welcome-drop" aria-hidden="true">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span>Or drop a folder anywhere in this window</span>
        </div>

        <div className="welcome-hints">
          <span>
            <kbd>⌘P</kbd> palette
          </span>
          <span>
            <kbd>?</kbd> shortcuts
          </span>
          <span>
            <kbd>c</kbd> comment mode
          </span>
        </div>
      </div>
      {cloning && (
        <Suspense fallback={null}>
          <CloneModal onClose={() => setCloning(false)} />
        </Suspense>
      )}
    </div>
  );
}
