import type { BundledLanguage, DiffHighlighter } from "@git-diff-view/shiki";

const LANGS: BundledLanguage[] = [
  "typescript",
  "tsx",
  "javascript",
  "jsx",
  "json",
  "css",
  "scss",
  "less",
  "html",
  "markdown",
  "rust",
  "go",
  "python",
  "ruby",
  "java",
  "kotlin",
  "swift",
  "c",
  "cpp",
  "csharp",
  "php",
  "bash",
  "shellscript",
  "toml",
  "yaml",
  "sql",
  "xml",
  "diff",
  "dockerfile",
  "makefile",
];

let cached: Promise<DiffHighlighter> | null = null;

export function getHighlighter(): Promise<DiffHighlighter> {
  if (!cached) {
    cached = import("@git-diff-view/shiki").then(
      ({ getDiffViewHighlighter }) => getDiffViewHighlighter(LANGS),
    );
  }
  return cached;
}
