import { getIconUrlForFilePath } from "vscode-material-icons";

/**
 * Where the VSCode Material icon SVGs are served from — must match the
 * `dest` in vite.config.ts's viteStaticCopy target.
 */
const ICONS_URL = "/material-icons";

/** Resolve a file name/path to its Material icon SVG URL (falls back to file.svg). */
export function fileIconUrl(path: string): string {
  return getIconUrlForFilePath(path, ICONS_URL);
}
