use std::path::{Path, PathBuf};

use git2::{BranchType, Repository, Sort};
use tauri::Emitter;
use tokio::io::AsyncReadExt;
use tokio::process::Command;

use super::types::{BranchInfo, CommitInfo, RefValidation, RepoInfo};

fn open(path: &str) -> Result<Repository, String> {
    Repository::open(path).map_err(|e| format!("not a git repository: {}", e.message()))
}

/// Probe write access by creating + removing a sentinel file. Works on every
/// OS we ship to (Unix bits, Windows ACLs, sandboxed temp locations).
fn check_writable(dir: &Path) -> Result<(), String> {
    let probe = dir.join(".differ-write-probe");
    match std::fs::File::create(&probe) {
        Ok(_) => {
            let _ = std::fs::remove_file(&probe);
            Ok(())
        }
        Err(e) => Err(format!("can't write to {}: {}", dir.display(), e)),
    }
}

#[tauri::command]
pub fn validate_repo(path: String) -> Result<RepoInfo, String> {
    let repo = open(&path)?;

    let canonical = std::fs::canonicalize(&path)
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|_| path.clone());

    let name = Path::new(&canonical)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("repo")
        .to_string();

    let head_branch = repo
        .head()
        .ok()
        .and_then(|h| h.shorthand().map(String::from));

    let default_branch = resolve_default_branch(&repo);

    let user_name = repo
        .config()
        .ok()
        .and_then(|cfg| cfg.get_string("user.name").ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    Ok(RepoInfo {
        path: canonical,
        name,
        default_branch,
        head_branch,
        user_name,
    })
}

/// Parse a repo "leaf name" out of a clone URL. Handles HTTPS, SSH, and
/// trailing `.git` / `/`. Returns None when no useful name can be derived.
fn repo_name_from_url(url: &str) -> Option<String> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return None;
    }
    // Strip protocol fluff so the splitter doesn't see slashes in the scheme.
    let stripped = trimmed
        .trim_end_matches('/')
        .rsplit(['/', ':'])
        .next()
        .unwrap_or(trimmed)
        .trim_end_matches(".git");
    if stripped.is_empty() {
        None
    } else {
        Some(stripped.to_string())
    }
}

#[tauri::command]
pub async fn clone_repo(
    app: tauri::AppHandle,
    url: String,
    parent_dir: String,
) -> Result<String, String> {
    let name = repo_name_from_url(&url)
        .ok_or_else(|| "couldn't infer a directory name from URL".to_string())?;
    let parent = PathBuf::from(&parent_dir);
    if !parent.is_dir() {
        return Err(format!("{} is not a directory", parent_dir));
    }
    check_writable(&parent)?;
    let target = parent.join(&name);
    if target.exists() {
        return Err(format!("{} already exists", target.display()));
    }

    let mut child = Command::new("git")
        .current_dir(&parent)
        .args(["clone", "--progress", &url, &name])
        .stderr(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("spawn git: {}", e))?;

    // git emits progress on stderr with `\r`-separated chunks between
    // newline-terminated lines. Tokenize on either separator and forward each
    // non-empty segment; the full stderr is accumulated for the error path.
    let mut stderr = child.stderr.take().ok_or("git stderr unavailable")?;
    let mut accumulator: Vec<u8> = Vec::with_capacity(1024);
    let mut full_stderr = String::new();
    let mut buf = [0u8; 512];
    loop {
        let n = stderr
            .read(&mut buf)
            .await
            .map_err(|e| format!("read git stderr: {}", e))?;
        if n == 0 {
            break;
        }
        accumulator.extend_from_slice(&buf[..n]);
        while let Some(pos) = accumulator
            .iter()
            .position(|&b| b == b'\r' || b == b'\n')
        {
            let line: Vec<u8> = accumulator.drain(..=pos).collect();
            let s = std::str::from_utf8(&line[..line.len() - 1])
                .unwrap_or("")
                .trim();
            if !s.is_empty() {
                full_stderr.push_str(s);
                full_stderr.push('\n');
                let _ = app.emit("clone-progress", s);
            }
        }
    }
    // Trailing text without a terminator.
    if !accumulator.is_empty() {
        if let Ok(s) = std::str::from_utf8(&accumulator) {
            let trimmed = s.trim();
            if !trimmed.is_empty() {
                full_stderr.push_str(trimmed);
                full_stderr.push('\n');
                let _ = app.emit("clone-progress", trimmed);
            }
        }
    }

    let status = child
        .wait()
        .await
        .map_err(|e| format!("wait git: {}", e))?;
    if !status.success() {
        return Err(format!("git clone failed: {}", full_stderr.trim()));
    }

    let canonical = std::fs::canonicalize(&target)
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|_| target.to_string_lossy().into_owned());
    Ok(canonical)
}

#[tauri::command]
pub async fn init_repo(path: String) -> Result<(), String> {
    let target = PathBuf::from(&path);
    if !target.is_dir() {
        return Err(format!("{} is not a directory", path));
    }
    // Surface permission errors up-front, before git2 fails cryptically.
    check_writable(&target)?;
    Repository::init(&target).map_err(|e| format!("git init: {}", e.message()))?;
    Ok(())
}

/// UI sentinel meaning "working tree" — never a real ref.
const WORKING_TREE_REF: &str = ":working-tree";

fn ref_resolves(repo: &Repository, name: &str) -> bool {
    if name == WORKING_TREE_REF {
        return true;
    }
    repo.revparse_single(name).is_ok()
}

/// If `name` is a local branch with an upstream tracking ref, return the
/// upstream's short name (`origin/main`). Returns None for remote-only refs,
/// detached SHAs, or branches without a configured upstream.
fn local_branch_upstream(repo: &Repository, name: &str) -> Option<String> {
    let branch = repo.find_branch(name, BranchType::Local).ok()?;
    let upstream = branch.upstream().ok()?;
    upstream.name().ok().flatten().map(String::from)
}

/// Per-repo refs validation in one round-trip. Returns whether each provided
/// ref still resolves. Used at hydration to detect stale persisted selections.
#[tauri::command]
pub fn validate_refs(
    path: String,
    base: Option<String>,
    compare: Option<String>,
    commit: Option<String>,
) -> Result<RefValidation, String> {
    let repo = open(&path)?;
    let base_upstream = base
        .as_deref()
        .and_then(|b| local_branch_upstream(&repo, b));
    Ok(RefValidation {
        base_valid: base.map(|b| ref_resolves(&repo, &b)),
        compare_valid: compare.map(|c| ref_resolves(&repo, &c)),
        commit_valid: commit.map(|sha| repo.revparse_single(&sha).is_ok()),
        base_upstream,
    })
}

fn resolve_default_branch(repo: &Repository) -> Option<String> {
    if let Ok(reference) = repo.find_reference("refs/remotes/origin/HEAD") {
        if let Some(target) = reference.symbolic_target() {
            return target
                .strip_prefix("refs/remotes/origin/")
                .map(|name| format!("origin/{}", name));
        }
    }
    for candidate in ["main", "master", "trunk", "develop"] {
        // Prefer the upstream tracking ref over the local branch — local
        // `main` drifts behind `origin/main` between fetches, which silently
        // bloats the cumulative diff vs. what GitHub shows for the same PR.
        if let Ok(branch) = repo.find_branch(candidate, BranchType::Local) {
            if let Some(name) = branch
                .upstream()
                .ok()
                .and_then(|u| u.name().ok().flatten().map(String::from))
            {
                return Some(name);
            }
            return Some(candidate.to_string());
        }
        let remote_name = format!("origin/{}", candidate);
        if repo
            .find_branch(&remote_name, BranchType::Remote)
            .is_ok()
        {
            return Some(remote_name);
        }
    }
    None
}

#[tauri::command]
pub fn list_branches(path: String) -> Result<Vec<BranchInfo>, String> {
    let repo = open(&path)?;
    let head_name = repo
        .head()
        .ok()
        .and_then(|h| h.shorthand().map(String::from));

    let mut out = Vec::new();
    let branches = repo
        .branches(None)
        .map_err(|e| format!("list branches: {}", e.message()))?;

    for entry in branches {
        let (branch, kind) = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let name = match branch.name() {
            Ok(Some(n)) => n.to_string(),
            _ => continue,
        };
        let is_remote = matches!(kind, BranchType::Remote);
        if is_remote && name.ends_with("/HEAD") {
            continue;
        }
        let upstream = if is_remote {
            None
        } else {
            branch
                .upstream()
                .ok()
                .and_then(|u| u.name().ok().flatten().map(String::from))
        };
        let is_head = !is_remote && head_name.as_deref() == Some(name.as_str());
        out.push(BranchInfo {
            name,
            is_remote,
            is_head,
            upstream,
        });
    }

    out.sort_by(|a, b| match (a.is_remote, b.is_remote) {
        (false, true) => std::cmp::Ordering::Less,
        (true, false) => std::cmp::Ordering::Greater,
        _ => a.name.cmp(&b.name),
    });

    Ok(out)
}

fn resolve_to_oid(repo: &Repository, refname: &str) -> Result<git2::Oid, String> {
    repo.revparse_single(refname)
        .map(|obj| obj.id())
        .map_err(|e| format!("ref not found '{}': {}", refname, e.message()))
}

#[tauri::command]
pub fn find_merge_base(
    path: String,
    base: String,
    compare: String,
) -> Result<String, String> {
    let repo = open(&path)?;
    let base_oid = resolve_to_oid(&repo, &base)?;
    let compare_oid = resolve_to_oid(&repo, &compare)?;
    repo.merge_base(base_oid, compare_oid)
        .map(|oid| oid.to_string())
        .map_err(|_| format!("no common ancestor between {} and {}", base, compare))
}

#[tauri::command]
pub fn list_commits(
    path: String,
    base: String,
    compare: String,
) -> Result<Vec<CommitInfo>, String> {
    let repo = open(&path)?;
    let base_oid = resolve_to_oid(&repo, &base)?;
    let compare_oid = resolve_to_oid(&repo, &compare)?;

    let mut walk = repo
        .revwalk()
        .map_err(|e| format!("revwalk: {}", e.message()))?;
    // Topological order without REVERSE puts the newest commit first — the
    // timeline strip renders left-to-right, so newest-on-left lands naturally.
    walk.set_sorting(Sort::TOPOLOGICAL)
        .map_err(|e| format!("sort: {}", e.message()))?;
    walk.push(compare_oid)
        .map_err(|e| format!("push compare: {}", e.message()))?;
    walk.hide(base_oid)
        .map_err(|e| format!("hide base: {}", e.message()))?;

    let mut out = Vec::new();
    for oid_res in walk {
        let oid = match oid_res {
            Ok(o) => o,
            Err(_) => continue,
        };
        let commit = match repo.find_commit(oid) {
            Ok(c) => c,
            Err(_) => continue,
        };
        let sha = oid.to_string();
        let short_sha = sha.chars().take(7).collect();
        let summary = commit.summary().unwrap_or("").to_string();
        let author = commit.author();
        out.push(CommitInfo {
            sha,
            short_sha,
            summary,
            author_name: author.name().unwrap_or("").to_string(),
            author_email: author.email().unwrap_or("").to_string(),
            timestamp: commit.time().seconds(),
            is_merge: commit.parent_count() > 1,
        });
    }

    Ok(out)
}
