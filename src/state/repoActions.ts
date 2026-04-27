import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import type { Repo } from "../types";
import { useStore } from "./store";

export async function pickAndAddRepo(): Promise<void> {
  const picked = await open({ directory: true, multiple: false });
  if (typeof picked !== "string") return;
  await addRepoByPath(picked);
}

export async function addRepoByPath(path: string): Promise<void> {
  try {
    const repo = await invoke<Repo>("validate_repo", { path });
    useStore.getState().addRepo({ ...repo, missing: false });
  } catch (err) {
    useStore.getState().pushToast(`Not a git repository: ${path}`);
    console.error(err);
  }
}
