import { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { addRepoByPath } from "@/state/repoActions";
import "./CloneModal.css";
import { useStore } from "@/state/store";
import { useAutoFocus } from "@/hooks";

/** URL-paste → pick destination → git clone → add the result. The Rust
 *  `clone_repo` command shells out to `git clone --progress` and emits
 *  `clone-progress` events that we surface in the status box. */
export function CloneModal({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [dest, setDest] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pushToast = useStore((s) => s.pushToast);

  useAutoFocus(inputRef);

  // Mount the listener for the modal's lifetime so we don't miss the
  // early "Cloning into …" chatter.
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

  // Best-effort default directory name parsed out of the URL.
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

export default CloneModal;
