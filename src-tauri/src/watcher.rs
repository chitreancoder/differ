//! Filesystem watcher for `.git` metadata. When a repo's HEAD or any ref
//! changes (commit, checkout, reset, fetch) we emit `repo-changed` so the
//! frontend can drop its caches and rerun the diff.
//!
//! Scope is intentionally narrow — we watch `HEAD`, the `refs/` tree, and
//! `packed-refs`. `objects/` and `index` are excluded; they churn on every
//! local edit and would create a refresh storm.

use std::collections::HashMap;
use std::sync::{mpsc, Mutex};
use std::time::Duration;

use git2::Repository;
use notify_debouncer_mini::notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_mini::{new_debouncer, Debouncer};
use tauri::{AppHandle, Emitter, State};

pub struct WatcherRegistry(Mutex<HashMap<String, Debouncer<RecommendedWatcher>>>);

impl WatcherRegistry {
    pub fn new() -> Self {
        Self(Mutex::new(HashMap::new()))
    }
}

impl Default for WatcherRegistry {
    fn default() -> Self {
        Self::new()
    }
}

#[tauri::command]
pub fn watch_repo(
    path: String,
    app: AppHandle,
    state: State<'_, WatcherRegistry>,
) -> Result<(), String> {
    let mut map = state
        .0
        .lock()
        .map_err(|e| format!("watcher lock poisoned: {}", e))?;
    if map.contains_key(&path) {
        return Ok(());
    }

    let repo = Repository::open(&path).map_err(|e| format!("open repo: {}", e.message()))?;
    let gitdir = repo.path().to_path_buf();
    drop(repo);

    let (tx, rx) = mpsc::channel();
    let mut debouncer = new_debouncer(Duration::from_millis(250), tx)
        .map_err(|e| format!("watcher init: {}", e))?;

    let head = gitdir.join("HEAD");
    if head.exists() {
        debouncer
            .watcher()
            .watch(&head, RecursiveMode::NonRecursive)
            .map_err(|e| format!("watch HEAD: {}", e))?;
    }
    let refs_dir = gitdir.join("refs");
    if refs_dir.exists() {
        debouncer
            .watcher()
            .watch(&refs_dir, RecursiveMode::Recursive)
            .map_err(|e| format!("watch refs: {}", e))?;
    }
    let packed = gitdir.join("packed-refs");
    if packed.exists() {
        debouncer
            .watcher()
            .watch(&packed, RecursiveMode::NonRecursive)
            .map_err(|e| format!("watch packed-refs: {}", e))?;
    }

    let app_clone = app.clone();
    let path_for_thread = path.clone();
    std::thread::spawn(move || {
        for res in rx {
            let events = match res {
                Ok(ev) => ev,
                Err(_) => break,
            };
            if events.is_empty() {
                continue;
            }
            // `<ref>.lock` files are created+renamed during ref updates. The
            // rename is what matters; the bare lock writes are noise.
            let meaningful = events.iter().any(|e| {
                e.path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .map(|n| !n.ends_with(".lock"))
                    .unwrap_or(true)
            });
            if !meaningful {
                continue;
            }
            let _ = app_clone.emit("repo-changed", &path_for_thread);
        }
    });

    map.insert(path, debouncer);
    Ok(())
}

#[tauri::command]
pub fn unwatch_repo(path: String, state: State<'_, WatcherRegistry>) -> Result<(), String> {
    let mut map = state
        .0
        .lock()
        .map_err(|e| format!("watcher lock poisoned: {}", e))?;
    map.remove(&path);
    Ok(())
}
