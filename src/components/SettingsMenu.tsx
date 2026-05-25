import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";
import type { ThemePreference } from "../types";

const THEME_CHOICES: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "Auto" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

/**
 * Top-bar Settings dropdown. Hosts the small, low-frequency view prefs that
 * previously lived as standalone toggles (theme, diff style, whitespace) so
 * the top-bar can stay focused on the actual review workflow. Keyboard
 * shortcuts and command-palette entries are unchanged — the menu is just an
 * additional discovery surface.
 */
export function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const themePreference = useStore((s) => s.themePreference);
  const setThemePreference = useStore((s) => s.setThemePreference);
  const diffStyle = useStore((s) => s.diffStyle);
  const setDiffStyle = useStore((s) => s.setDiffStyle);
  const ignoreWhitespace = useStore((s) => s.ignoreWhitespace);
  const toggleIgnoreWhitespace = useStore((s) => s.toggleIgnoreWhitespace);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="settings-menu" ref={rootRef}>
      <button
        ref={buttonRef}
        className={`btn-toggle ${open ? "active" : ""}`}
        onClick={() => setOpen((v) => !v)}
        title="Settings"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Settings"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
      {open && (
        <div className="settings-menu-panel" role="menu">
          <SettingRow label="Theme" shortcut="⌘⇧T">
            <div className="settings-segmented" role="radiogroup">
              {THEME_CHOICES.map((c) => (
                <button
                  key={c.value}
                  className={`settings-seg ${
                    themePreference === c.value ? "active" : ""
                  }`}
                  onClick={() => setThemePreference(c.value)}
                  role="radio"
                  aria-checked={themePreference === c.value}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </SettingRow>

          <SettingRow label="Diff style" shortcut="d  ⌘L">
            <div className="settings-segmented" role="radiogroup">
              <button
                className={`settings-seg ${diffStyle === "split" ? "active" : ""}`}
                onClick={() => setDiffStyle("split")}
                role="radio"
                aria-checked={diffStyle === "split"}
              >
                Split
              </button>
              <button
                className={`settings-seg ${diffStyle === "unified" ? "active" : ""}`}
                onClick={() => setDiffStyle("unified")}
                role="radio"
                aria-checked={diffStyle === "unified"}
              >
                Unified
              </button>
            </div>
          </SettingRow>

          <SettingRow label="Ignore whitespace" shortcut="w">
            <button
              className={`settings-switch ${ignoreWhitespace ? "on" : ""}`}
              onClick={() => toggleIgnoreWhitespace()}
              role="switch"
              aria-checked={ignoreWhitespace}
            >
              <span className="settings-switch-thumb" />
            </button>
          </SettingRow>
        </div>
      )}
    </div>
  );
}

function SettingRow({
  label,
  shortcut,
  children,
}: {
  label: string;
  shortcut?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="settings-row">
      <div className="settings-row-label">
        <span>{label}</span>
        {shortcut && <span className="settings-row-kbd">{shortcut}</span>}
      </div>
      {children}
    </div>
  );
}
