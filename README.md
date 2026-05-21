# Differ

A fast, keyboard-driven desktop app for reviewing **branch-level git diffs** — and feeding your notes straight back to [Claude Code](https://claude.com/claude-code).

Differ shows you the cumulative diff between two branches (or a single commit) in a clean, syntax-highlighted UI built for code review. It's aimed at people who work with AI coding agents all day: see what changed *before* it hits a PR, drop inline comments on the lines you care about, and export them as a ready-to-paste prompt for Claude.

Built with [Tauri 2](https://tauri.app/) (Rust) + React + TypeScript.

## Features

- **Branch-to-branch diffs** — pick a base and a compare ref and see the whole accumulated change set, not just one commit.
- **File tree** with search and a resizable pane, ordered to match the diff view.
- **Comment mode** — select lines in any file and attach freeform review notes.
- **Export for Claude** — copies a structured markdown review prompt to your clipboard *and* writes `.differ/review.md` in the repo. A one-time setup installs a global `/differ-review` slash command so Claude Code can read your notes directly.
- **Split / inline** diff styles, commit timeline, command palette, and full keyboard navigation.

## Install

Grab the latest **`.dmg`** from the [Releases page](https://github.com/chitreancoder/differ/releases), open it, and drag Differ into your Applications folder. The build is a universal binary (Apple Silicon + Intel).

> macOS Gatekeeper may block the app on first launch since it isn't notarized yet — right-click the app and choose **Open** to get past it.

### Build from source

Prefer to build it yourself, or on another platform? You'll need [Node.js](https://nodejs.org/) + [pnpm](https://pnpm.io/) and the [Rust toolchain](https://www.rust-lang.org/tools/install) (see [Tauri prerequisites](https://tauri.app/start/prerequisites/)).

```bash
git clone https://github.com/chitreancoder/differ.git
cd differ
pnpm install
pnpm tauri build      # native app bundle in src-tauri/target/release/bundle
pnpm tauri dev        # or: run in dev with hot reload
```

## Usage

1. Open a git repository.
2. Choose a **base** and **compare** branch (or select a commit from the timeline).
3. Review the diff. Handy keys:

   | Key | Action |
   | --- | --- |
   | `j` / `k` | next / previous file |
   | `n` | next unread file |
   | `x` | mark file reviewed |
   | `d` | toggle split / inline |
   | `c` | toggle comment mode |
   | `⌘P` / `⌘K` | command palette / jump to file |
   | `?` | show all shortcuts |

4. In **comment mode**, drag across the line-number gutter to select lines, click **Add comment**, and write a note.
5. Hit **Export for Claude** in the status bar. Then in Claude Code run `/differ-review` (after the one-time command setup) or just paste — your comments go in as a review prompt.

## Contributing

Differ is **open source** and contributions are very welcome — issues, feature ideas, and pull requests all help. Open an issue to discuss anything substantial first, then send a PR. If you're building locally, `pnpm tsc --noEmit` and `pnpm build` should both pass before you push.

## License

Released under the [MIT License](LICENSE) — free to use, modify, and distribute.
