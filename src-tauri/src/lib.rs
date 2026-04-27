mod git;

use git::{
    diff_commit_file, diff_commit_name_status, diff_file, diff_name_status, find_merge_base,
    list_branches, list_commits, validate_repo,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            validate_repo,
            list_branches,
            list_commits,
            find_merge_base,
            diff_name_status,
            diff_file,
            diff_commit_name_status,
            diff_commit_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
