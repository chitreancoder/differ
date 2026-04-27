import { useEffect, useRef } from "react";
import { Command } from "cmdk";
import { useStore } from "../state/store";
import { refreshAll } from "../state/refresh";
import { fileAnchorId } from "../utils/diff";
import { pickAndAddRepo } from "../state/repoActions";

export function CommandPalette() {
  const open = useStore((s) => s.paletteOpen);
  const setOpen = useStore((s) => s.setPaletteOpen);
  const repos = useStore((s) => s.repos);
  const activeRepoPath = useStore((s) => s.activeRepoPath);
  const files = useStore((s) => s.currentFiles);
  const setActiveRepo = useStore((s) => s.setActiveRepo);
  const setBranchPickerKind = useStore((s) => s.setBranchPickerKind);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const toggleDiffStyle = useStore((s) => s.toggleDiffStyle);
  const setCurrentFilePath = useStore((s) => s.setCurrentFilePath);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open) return null;

  const close = () => setOpen(false);

  const jumpToFile = (path: string) => {
    setCurrentFilePath(path);
    document
      .getElementById(fileAnchorId(path))
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
    close();
  };

  return (
    <div className="palette-overlay" onClick={close}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <Command label="Command palette" loop>
          <Command.Input
            ref={inputRef}
            placeholder="Type a command or file…"
          />
          <Command.List>
            <Command.Empty>No results.</Command.Empty>

            <Command.Group heading="Actions">
              {activeRepoPath && (
                <>
                  <Command.Item
                    onSelect={() => {
                      setBranchPickerKind("base");
                      close();
                    }}
                  >
                    Change base branch
                  </Command.Item>
                  <Command.Item
                    onSelect={() => {
                      setBranchPickerKind("compare");
                      close();
                    }}
                  >
                    Change compare branch
                  </Command.Item>
                  <Command.Item
                    onSelect={() => {
                      refreshAll();
                      close();
                    }}
                  >
                    Refresh <span className="palette-shortcut">⌘R</span>
                  </Command.Item>
                </>
              )}
              <Command.Item
                onSelect={() => {
                  toggleDiffStyle();
                  close();
                }}
              >
                Toggle diff style{" "}
                <span className="palette-shortcut">⌘L</span>
              </Command.Item>
              <Command.Item
                onSelect={() => {
                  toggleSidebar();
                  close();
                }}
              >
                Toggle sidebar{" "}
                <span className="palette-shortcut">⌘\</span>
              </Command.Item>
              <Command.Item
                onSelect={() => {
                  pickAndAddRepo();
                  close();
                }}
              >
                Add repository…
              </Command.Item>
            </Command.Group>

            {repos.length > 0 && (
              <Command.Group heading="Repositories">
                {repos.map((repo, i) => (
                  <Command.Item
                    key={repo.path}
                    value={`repo:${repo.name} ${repo.path}`}
                    disabled={repo.missing}
                    onSelect={() => {
                      setActiveRepo(repo.path);
                      close();
                    }}
                  >
                    <span className="palette-name">{repo.name}</span>
                    <span className="palette-path muted">{repo.path}</span>
                    {i < 9 && (
                      <span className="palette-shortcut">⌘{i + 1}</span>
                    )}
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {files.length > 0 && (
              <Command.Group heading="Jump to file">
                {files.map((f) => (
                  <Command.Item
                    key={f.path}
                    value={`file:${f.path}`}
                    onSelect={() => jumpToFile(f.path)}
                  >
                    <span className="palette-path">{f.path}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
