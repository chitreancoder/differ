import { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { pickAndAddRepo, addRepoByPath } from "@/state/repoActions";
import { useStore } from "@/state/store";
import iconUrl from "@/assets/icon.png";

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
      {cloning && <CloneModal onClose={() => setCloning(false)} />}
    </div>
  );
}

/**
 * URL-paste → pick destination → git clone → add the result. We keep the
 * UI dumb (input + dest picker + status line) and put the heavy lifting in
 * a single `clone_repo` Tauri command that shells out to `git clone`. No
 * streamed progress in 0.2.x — clones are blocking and we show a spinner.
 */
function CloneModal({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [dest, setDest] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pushToast = useStore((s) => s.pushToast);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Stream git's progress output (emitted from the Rust clone_repo command as
  // `clone-progress` events) into a single live status line. Mounted once for
  // the lifetime of the modal so we don't miss the early "Cloning into …"
  // chatter while the listener is still wiring up.
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    let cancelled = false;
    (async () => {
      const fn = await listen<string>("clone-progress", (event) => {
        setProgress(event.payload);
      });
      if (cancelled) fn();
      else unlisten = fn;
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // Best-effort default directory name parsed out of the URL ("foo.git" or
  // "/foo" → "foo"). The user can still override via the picker.
  const inferredName = (() => {
    const trimmed = url.trim();
    if (!trimmed) return null;
    const match = trimmed.match(/[/:]([^/:]+?)(?:\.git)?\/?$/);
    return match ? match[1] : null;
  })();

  const pickDest = async () => {
    const picked = await open({ directory: true, multiple: false });
    if (typeof picked === "string") setDest(picked);
  };

  const submit = async () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl || !dest) return;
    setBusy(true);
    setError(null);
    setProgress(null);
    try {
      const cloned = await invoke<string>("clone_repo", {
        url: trimmedUrl,
        parentDir: dest,
      });
      await addRepoByPath(cloned);
      pushToast(`Cloned ${trimmedUrl} → ${cloned}`, "info");
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <div className="modal-overlay" onClick={() => !busy && onClose()}>
      <div
        className="welcome-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Clone from URL"
      >
        <h2 className="welcome-modal-title">Clone from URL</h2>
        <label className="welcome-field">
          <span>Repository URL</span>
          <input
            ref={inputRef}
            type="text"
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            placeholder="https://github.com/owner/repo  ·  git@github.com:owner/repo.git"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && dest && !busy) submit();
              if (e.key === "Escape") onClose();
            }}
          />
        </label>
        <label className="welcome-field">
          <span>Clone into</span>
          <div className="welcome-dest">
            <button
              className="btn-secondary welcome-dest-pick"
              onClick={pickDest}
              type="button"
            >
              {dest ? "Change folder…" : "Choose folder…"}
            </button>
            <span className="welcome-dest-path">
              {dest ? (
                <>
                  <code>{dest}</code>
                  {inferredName && (
                    <span className="muted"> / {inferredName}</span>
                  )}
                </>
              ) : (
                <span className="muted">No folder picked.</span>
              )}
            </span>
          </div>
        </label>
        {busy && progress && (
          <div className="welcome-modal-progress" aria-live="polite">
            {progress}
          </div>
        )}
        {error && <div className="welcome-modal-error">{error}</div>}
        <div className="welcome-modal-actions">
          <button
            className="btn-secondary"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={submit}
            disabled={!url.trim() || !dest || busy}
          >
            {busy ? "Cloning…" : "Clone"}
          </button>
        </div>
      </div>
    </div>
  );
}
