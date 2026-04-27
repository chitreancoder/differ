import { clearBranchCache } from "./branches";
import { clearCommitsCache } from "./commits";
import { clearDiffTextCache } from "./diffText";
import { useStore } from "./store";

export function refreshAll() {
  clearBranchCache();
  clearCommitsCache();
  clearDiffTextCache();
  useStore.getState().bumpRefresh();
}
