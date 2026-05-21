use std::fs;
use std::path::PathBuf;

use git2::Repository;

/// Write the review markdown to `<repo-root>/.differ/review.md` and make sure
/// `.differ/` is ignored via `.git/info/exclude` (never touching `.gitignore`).
/// Returns the absolute path written.
#[tauri::command]
pub fn write_review_file(repo_path: String, content: String) -> Result<String, String> {
    let repo = Repository::open(&repo_path)
        .map_err(|e| format!("not a git repository: {}", e.message()))?;
    let root = repo
        .workdir()
        .ok_or_else(|| "repository has no working tree".to_string())?
        .to_path_buf();

    let differ_dir = root.join(".differ");
    fs::create_dir_all(&differ_dir)
        .map_err(|e| format!("create .differ dir: {}", e))?;

    let file_path = differ_dir.join("review.md");
    fs::write(&file_path, content).map_err(|e| format!("write review.md: {}", e))?;

    ensure_excluded(&root)?;

    Ok(file_path.to_string_lossy().into_owned())
}

/// Append `.differ/` to `.git/info/exclude` if it isn't already listed.
fn ensure_excluded(root: &PathBuf) -> Result<(), String> {
    let exclude_path = root.join(".git").join("info").join("exclude");
    let existing = fs::read_to_string(&exclude_path).unwrap_or_default();
    let already = existing
        .lines()
        .any(|l| l.trim() == ".differ/" || l.trim() == ".differ");
    if already {
        return Ok(());
    }
    if let Some(parent) = exclude_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create .git/info: {}", e))?;
    }
    let mut next = existing;
    if !next.is_empty() && !next.ends_with('\n') {
        next.push('\n');
    }
    next.push_str(".differ/\n");
    fs::write(&exclude_path, next).map_err(|e| format!("write info/exclude: {}", e))?;
    Ok(())
}

fn claude_command_path() -> Result<PathBuf, String> {
    let home = std::env::var("HOME").map_err(|_| "HOME not set".to_string())?;
    Ok(PathBuf::from(home)
        .join(".claude")
        .join("commands")
        .join("differ-review.md"))
}

const CLAUDE_COMMAND_BODY: &str = r#"---
description: Address review comments left in Differ
---
Read @.differ/review.md (look at the repo root if not in the current directory) and address each review comment in this repo. As you handle each one, check it off in that file.
"#;

/// Install the global `~/.claude/commands/differ-review.md` slash command.
/// Overwriting is fine — the frontend confirms first. Returns the path written.
#[tauri::command]
pub fn setup_claude_command() -> Result<String, String> {
    let path = claude_command_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create commands dir: {}", e))?;
    }
    fs::write(&path, CLAUDE_COMMAND_BODY).map_err(|e| format!("write command: {}", e))?;
    Ok(path.to_string_lossy().into_owned())
}

/// Whether the `/differ-review` slash command is already installed.
#[tauri::command]
pub fn claude_command_status() -> Result<bool, String> {
    let path = claude_command_path()?;
    Ok(path.exists())
}
