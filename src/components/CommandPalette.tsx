import { useEffect, useRef } from "react";
import { Command } from "cmdk";
import { ask } from "@tauri-apps/plugin-dialog";
import { useStore } from "@/state/store";
import { fetchRemote, refreshAll } from "@/state/refresh";
import { pickAndAddRepo } from "@/state/repoActions";
import {
  claudeCommandStatus,
  exportForClaude,
  setupClaudeCommand,
} from "@/state/review";

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
  const toggleCommentMode = useStore((s) => s.toggleCommentMode);
  const setThemePreference = useStore((s) => s.setThemePreference);
  const toggleIgnoreWhitespace = useStore((s) => s.toggleIgnoreWhitespace);
  const toggleCommentsOnlyFilter = useStore(
    (s) => s.toggleCommentsOnlyFilter,
  );
  const toggleSearchOpen = useStore((s) => s.toggleSearchOpen);
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
    close();
  };

  const activeScope = () => {
    const s = useStore.getState();
    const repoPath = s.activeRepoPath;
    if (!repoPath) return null;
    const b = s.base[repoPath];
    const c = s.compare[repoPath];
    if (!b || !c) return null;
    const commit = s.selectedCommit[repoPath] ?? "";
    return `${repoPath}|${b}|${c}|${commit}`;
  };

  const exportComments = async () => {
    const s = useStore.getState();
    const scope = activeScope();
    const repoPath = s.activeRepoPath;
    if (!scope || !repoPath) return;
    const comments = s.comments[scope] ?? [];
    if (comments.length === 0) {
      s.pushToast("No comments to export.", "info");
      return;
    }
    const repoName =
      s.repos.find((r) => r.path === repoPath)?.name ?? repoPath;
    try {
      await exportForClaude(repoPath, comments);
      s.markCommentsSent(scope, comments.map((c) => c.id));
      s.pushToast(
        `Copied review for ${repoName} + wrote .differ/review.md`,
        "info",
      );
    } catch (e) {
      s.pushToast(`Export failed: ${e}`, "error");
    }
  };

  const installClaudeCommand = async () => {
    const s = useStore.getState();
    const exists = await claudeCommandStatus().catch(() => false);
    const ok = await ask(
      exists
        ? "Overwrite the existing ~/.claude/commands/differ-review.md slash command?"
        : "Install the /differ-review slash command at ~/.claude/commands/differ-review.md?",
      { title: "Set up Claude command", kind: "info" },
    );
    if (!ok) return;
    try {
      const path = await setupClaudeCommand();
      s.pushToast(`Installed /differ-review (${path})`, "info");
    } catch (e) {
      s.pushToast(`Setup failed: ${e}`, "error");
    }
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
                      if (activeRepoPath) fetchRemote(activeRepoPath);
                      else refreshAll();
                      close();
                    }}
                  >
                    Fetch &amp; refresh{" "}
                    <span className="palette-shortcut">⌘R</span>
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
                  toggleCommentMode();
                  close();
                }}
              >
                Toggle comment mode{" "}
                <span className="palette-shortcut">c</span>
              </Command.Item>
              <Command.Item
                onSelect={() => {
                  toggleIgnoreWhitespace();
                  close();
                }}
              >
                Toggle ignore whitespace{" "}
                <span className="palette-shortcut">w</span>
              </Command.Item>
              <Command.Item
                onSelect={() => {
                  toggleCommentsOnlyFilter();
                  close();
                }}
              >
                Toggle "files with comments" filter{" "}
                <span className="palette-shortcut">f</span>
              </Command.Item>
              <Command.Item
                onSelect={() => {
                  toggleSearchOpen();
                  close();
                }}
              >
                Find in diff <span className="palette-shortcut">⌘F</span>
              </Command.Item>
              <Command.Item
                value="theme system follow auto"
                onSelect={() => {
                  setThemePreference("system");
                  close();
                }}
              >
                Theme: Follow system
              </Command.Item>
              <Command.Item
                value="theme light"
                onSelect={() => {
                  setThemePreference("light");
                  close();
                }}
              >
                Theme: Light
              </Command.Item>
              <Command.Item
                value="theme dark"
                onSelect={() => {
                  setThemePreference("dark");
                  close();
                }}
              >
                Theme: Dark
              </Command.Item>
              {activeRepoPath && (
                <Command.Item
                  onSelect={() => {
                    exportComments();
                    close();
                  }}
                >
                  Export comments for Claude
                </Command.Item>
              )}
              <Command.Item
                onSelect={() => {
                  installClaudeCommand();
                  close();
                }}
              >
                Set up Claude command (/differ-review)
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
