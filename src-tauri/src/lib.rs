mod git;
mod review;

use git::{
    clone_repo, diff_all, diff_commit_all, diff_commit_file, diff_commit_name_status, diff_file,
    diff_name_status, diff_working_tree_all, diff_working_tree_file,
    diff_working_tree_name_status, find_merge_base, init_repo, list_branches, list_commits,
    repo_fetch, validate_repo,
};
use review::{claude_command_status, setup_claude_command, write_review_file};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            validate_repo,
            clone_repo,
            init_repo,
            list_branches,
            list_commits,
            find_merge_base,
            repo_fetch,
            diff_name_status,
            diff_file,
            diff_all,
            diff_commit_name_status,
            diff_commit_file,
            diff_commit_all,
            diff_working_tree_name_status,
            diff_working_tree_file,
            diff_working_tree_all,
            write_review_file,
            setup_claude_command,
            claude_command_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
