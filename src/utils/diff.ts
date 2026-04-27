import type { FileEntry } from "../types";

const LOCK_PATTERNS = [
  /(^|\/)package-lock\.json$/,
  /(^|\/)yarn\.lock$/,
  /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)Cargo\.lock$/,
  /(^|\/)Gemfile\.lock$/,
  /(^|\/)poetry\.lock$/,
  /(^|\/)composer\.lock$/,
  /(^|\/)go\.sum$/,
  /\.lock$/,
  /\.min\.js$/,
  /\.min\.css$/,
  /\.map$/,
];

const COLLAPSE_LINE_THRESHOLD = 5000;
const REFUSE_LINE_THRESHOLD = 50000;

export function shouldCollapseByDefault(file: FileEntry): boolean {
  if (LOCK_PATTERNS.some((re) => re.test(file.path))) return true;
  return file.additions + file.deletions > COLLAPSE_LINE_THRESHOLD;
}

export function isTooLarge(file: FileEntry): boolean {
  return file.additions + file.deletions > REFUSE_LINE_THRESHOLD;
}

export function fileAnchorId(path: string): string {
  return `file-${path.replace(/[^a-zA-Z0-9]/g, "_")}`;
}

const EXTENSION_LANG: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  css: "css",
  scss: "scss",
  html: "html",
  md: "markdown",
  rs: "rust",
  go: "go",
  py: "python",
  rb: "ruby",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  c: "c",
  h: "c",
  cpp: "cpp",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  toml: "toml",
  yaml: "yaml",
  yml: "yaml",
  sql: "sql",
};

export function langFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_LANG[ext] ?? "plaintext";
}
