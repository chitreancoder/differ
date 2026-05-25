/** Façade for adding repos — wraps validate_repo (and init_repo for non-git
 *  folders) and folds the result into the store. */
import { ask, open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import type { Repo } from "@/types";
import { useStore } from "@/state/store";

export async function pickAndAddRepo(): Promise<void> {
  const picked = await open({ directory: true, multiple: false });
  if (typeof picked !== "string") return;
  await addRepoByPath(picked);
}

export async function addRepoByPath(path: string): Promise<void> {
  try {
    const repo = await invoke<Repo>("validate_repo", { path });
    useStore.getState().addRepo({ ...repo, missing: false });
  } catch {
    // validate_repo only fails because the folder isn't a git repo. Offer to
    // turn it into one — git init is cheap and frequently exactly what the
    // user wanted to do anyway.
    const store = useStore.getState();
    const shouldInit = await ask(
      `${path} isn't a git repository.\n\nInitialize one here?`,
      { title: "Initialize Git", kind: "info" },
    );
    if (!shouldInit) {
      store.pushToast(`Not a git repository: ${path}`);
      return;
    }
    try {
      await invoke("init_repo", { path });
      const repo = await invoke<Repo>("validate_repo", { path });
      store.addRepo({ ...repo, missing: false });
      store.pushToast(`Initialized empty Git repository at ${path}`, "info");
    } catch (e) {
      store.pushToast(`Couldn't initialize: ${e}`);
    }
  }
}
