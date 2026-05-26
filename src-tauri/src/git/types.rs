use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoInfo {
    pub path: String,
    pub name: String,
    pub default_branch: Option<String>,
    pub head_branch: Option<String>,
    /// `git config user.name` resolved for this repo (falls back to the global
    /// config since git2's repo.config() merges global into the repo view).
    /// Absent if not configured.
    pub user_name: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchInfo {
    pub name: String,
    pub is_remote: bool,
    pub is_head: bool,
    pub upstream: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RefValidation {
    /// `true` if the ref resolves; `null` if it wasn't provided.
    pub base_valid: Option<bool>,
    pub compare_valid: Option<bool>,
    pub commit_valid: Option<bool>,
    /// When `base` is a local branch with an upstream tracking ref, the
    /// upstream's short name (e.g. `origin/main`). The frontend uses this to
    /// migrate stale persisted bases that have drifted behind the remote.
    pub base_upstream: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitInfo {
    pub sha: String,
    pub short_sha: String,
    pub summary: String,
    pub author_name: String,
    pub author_email: String,
    pub timestamp: i64,
    pub is_merge: bool,
}
