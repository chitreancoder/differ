import { useStore } from "../state/store";

const GROUPS: Array<[string, Array<[string, string]>]> = [
  [
    "Navigation",
    [
      ["j  ↓", "Next file"],
      ["k  ↑", "Previous file"],
      ["g g", "First file"],
      ["G", "Last file"],
      ["⌘ P", "Jump to file…"],
      ["⌘ K", "Command palette"],
    ],
  ],
  [
    "Review",
    [
      ["x", "Toggle reviewed"],
      ["n", "Next unreviewed"],
    ],
  ],
  [
    "View",
    [
      ["d  ⌘ L", "Toggle inline / split"],
      ["⌘ \\", "Toggle sidebar"],
      ["⌘ R", "Fetch & refresh"],
      ["?", "This cheatsheet"],
    ],
  ],
];

export function ShortcutsHelp() {
  const open = useStore((s) => s.shortcutsOpen);
  const setOpen = useStore((s) => s.setShortcutsOpen);
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={() => setOpen(false)}>
      <div
        className="shortcuts-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shortcuts-title">Keyboard shortcuts</div>
        {GROUPS.map(([title, items]) => (
          <div key={title} className="shortcuts-group">
            <div className="shortcuts-group-title">{title}</div>
            {items.map(([keys, label]) => (
              <div key={keys} className="shortcuts-row">
                <span className="shortcuts-label">{label}</span>
                <span className="shortcuts-keys">
                  {keys.split(" ").map((k, i) =>
                    k ? (
                      <kbd key={`${k}-${i}`}>{k}</kbd>
                    ) : (
                      <span key={`sp-${i}`} className="shortcuts-kspace" />
                    ),
                  )}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
