use std::path::Path;

use git2::{BranchType, Repository, Sort};

use super::types::{BranchInfo, CommitInfo, RepoInfo};

fn open(path: &str) -> Result<Repository, String> {
    Repository::open(path).map_err(|e| format!("not a git repository: {}", e.message()))
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

    Ok(RepoInfo {
        path: canonical,
        name,
        default_branch,
        head_branch,
    })
}

fn resolve_default_branch(repo: &Repository) -> Option<String> {
    if let Ok(reference) = repo.find_reference("refs/remotes/origin/HEAD") {
        if let Some(target) = reference.symbolic_target() {
            return target
                .strip_prefix("refs/remotes/origin/")
                .map(String::from);
        }
    }
    for candidate in ["main", "master", "trunk", "develop"] {
        if repo
            .find_branch(candidate, BranchType::Local)
            .is_ok()
        {
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
    walk.set_sorting(Sort::TOPOLOGICAL | Sort::REVERSE)
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
