import { useStore } from "../state/store";

function Kbd({ children }: { children: React.ReactNode }) {
  return <span className="statusbar-kbd">{children}</span>;
}

export function StatusBar() {
  const files = useStore((s) => s.currentFiles);
  const currentFilePath = useStore((s) => s.currentFilePath);
  const diffStyle = useStore((s) => s.diffStyle);
  const toggleShortcuts = useStore((s) => s.toggleShortcuts);

  if (files.length === 0) return null;

  const idx = currentFilePath
    ? files.findIndex((f) => f.path === currentFilePath)
    : -1;
  const position = idx >= 0 ? idx + 1 : "—";

  return (
    <div className="statusbar">
      <span className="statusbar-pos">
        {position}/{files.length}
      </span>
      <span className="statusbar-hint">
        <Kbd>j</Kbd> <Kbd>k</Kbd> nav
      </span>
      <span className="statusbar-hint">
        <Kbd>x</Kbd> review
      </span>
      <span className="statusbar-hint">
        <Kbd>n</Kbd> next unread
      </span>
      <span className="statusbar-hint">
        <Kbd>d</Kbd> {diffStyle === "split" ? "unified" : "split"}
      </span>
      <span className="statusbar-hint">
        <Kbd>⌘P</Kbd> jump
      </span>
      <button
        className="statusbar-hint statusbar-help"
        onClick={() => toggleShortcuts()}
        title="Show all shortcuts"
      >
        <Kbd>?</Kbd> shortcuts
      </button>
      <span className="statusbar-spacer" />
      <span className="statusbar-mode">
        {diffStyle === "split" ? "split" : "inline"}
      </span>
    </div>
  );
}
