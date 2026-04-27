use std::collections::HashMap;

use serde::Serialize;
use tokio::process::Command;

#[derive(Debug, Serialize, Clone)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum FileStatus {
    Added,
    Modified,
    Deleted,
    Renamed { from: String },
    Copied { from: String },
    TypeChanged,
    Unmerged,
    Unknown,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub path: String,
    pub status: FileStatus,
    pub additions: usize,
    pub deletions: usize,
    pub is_binary: bool,
}

async fn run_git(repo: &str, args: &[&str]) -> Result<String, String> {
    let out = Command::new("git")
        .current_dir(repo)
        .args(args)
        .output()
        .await
        .map_err(|e| format!("spawn git: {}", e))?;
    if !out.status.success() {
        return Err(format!(
            "git {} failed: {}",
            args.join(" "),
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    String::from_utf8(out.stdout).map_err(|_| "non-utf8 git output".to_string())
}

fn parse_name_status(text: &str) -> Vec<(FileStatus, String)> {
    let mut out = Vec::new();
    for line in text.lines() {
        if line.is_empty() {
            continue;
        }
        let mut parts = line.split('\t');
        let raw_status = parts.next().unwrap_or("");
        let first_path = parts.next().unwrap_or("");
        let second_path = parts.next();
        if first_path.is_empty() {
            continue;
        }
        let first_char = raw_status.chars().next().unwrap_or('?');
        let (status, path) = match first_char {
            'A' => (FileStatus::Added, first_path.to_string()),
            'M' => (FileStatus::Modified, first_path.to_string()),
            'D' => (FileStatus::Deleted, first_path.to_string()),
            'R' => (
                FileStatus::Renamed {
                    from: first_path.to_string(),
                },
                second_path.unwrap_or(first_path).to_string(),
            ),
            'C' => (
                FileStatus::Copied {
                    from: first_path.to_string(),
                },
                second_path.unwrap_or(first_path).to_string(),
            ),
            'T' => (FileStatus::TypeChanged, first_path.to_string()),
            'U' => (FileStatus::Unmerged, first_path.to_string()),
            _ => (FileStatus::Unknown, first_path.to_string()),
        };
        out.push((status, path));
    }
    out
}

fn parse_numstat(text: &str) -> HashMap<String, (usize, usize, bool)> {
    let mut out = HashMap::new();
    for line in text.lines() {
        if line.is_empty() {
            continue;
        }
        let mut parts = line.splitn(3, '\t');
        let adds = parts.next().unwrap_or("");
        let dels = parts.next().unwrap_or("");
        let path_field = parts.next().unwrap_or("");
        if path_field.is_empty() {
            continue;
        }
        let is_binary = adds == "-" && dels == "-";
        let additions = adds.parse().unwrap_or(0);
        let deletions = dels.parse().unwrap_or(0);
        // Rename format (no -z): "old => new" or "{prefix}old => new{suffix}"
        let resolved_path = if let Some(idx) = path_field.rfind(" => ") {
            let after = &path_field[idx + 4..];
            after.trim_end_matches('}').to_string()
        } else {
            path_field.to_string()
        };
        out.insert(resolved_path, (additions, deletions, is_binary));
    }
    out
}

fn merge_entries(
    entries: Vec<(FileStatus, String)>,
    counts: HashMap<String, (usize, usize, bool)>,
) -> Vec<FileEntry> {
    entries
        .into_iter()
        .map(|(status, path)| {
            let (additions, deletions, is_binary) =
                counts.get(&path).copied().unwrap_or((0, 0, false));
            FileEntry {
                path,
                status,
                additions,
                deletions,
                is_binary,
            }
        })
        .collect()
}

#[tauri::command]
pub async fn diff_name_status(
    path: String,
    base: String,
    compare: String,
) -> Result<Vec<FileEntry>, String> {
    let range = format!("{}...{}", base, compare);
    let name_status = run_git(
        &path,
        &["diff", "--name-status", "-M", "-C", &range],
    )
    .await?;
    let numstat = run_git(&path, &["diff", "--numstat", "-M", "-C", &range]).await?;
    Ok(merge_entries(parse_name_status(&name_status), parse_numstat(&numstat)))
}

#[tauri::command]
pub async fn diff_file(
    path: String,
    base: String,
    compare: String,
    file: String,
) -> Result<String, String> {
    let range = format!("{}...{}", base, compare);
    run_git(&path, &["diff", "--no-color", &range, "--", &file]).await
}

#[tauri::command]
pub async fn diff_commit_name_status(
    path: String,
    sha: String,
) -> Result<Vec<FileEntry>, String> {
    let name_status = run_git(
        &path,
        &[
            "diff-tree",
            "-r",
            "--root",
            "--no-commit-id",
            "--name-status",
            "-M",
            "-C",
            &sha,
        ],
    )
    .await?;
    let numstat = run_git(
        &path,
        &[
            "diff-tree",
            "-r",
            "--root",
            "--no-commit-id",
            "--numstat",
            "-M",
            "-C",
            &sha,
        ],
    )
    .await?;
    Ok(merge_entries(parse_name_status(&name_status), parse_numstat(&numstat)))
}

#[tauri::command]
pub async fn repo_fetch(path: String) -> Result<(), String> {
    run_git(&path, &["fetch", "--all", "--prune", "--quiet"])
        .await
        .map(|_| ())
}

#[tauri::command]
pub async fn diff_commit_file(
    path: String,
    sha: String,
    file: String,
) -> Result<String, String> {
    run_git(
        &path,
        &[
            "diff-tree",
            "-r",
            "--root",
            "--no-commit-id",
            "-p",
            "--no-color",
            &sha,
            "--",
            &file,
        ],
    )
    .await
}
