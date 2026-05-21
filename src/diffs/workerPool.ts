import type {
  WorkerInitializationRenderOptions,
  WorkerPoolOptions,
} from "@pierre/diffs/react";

/**
 * Pierre runs Shiki syntax highlighting in a pool of Web Workers so it never
 * blocks scrolling. `worker-portable.js` is a self-contained bundle meant to be
 * loaded via `new Worker(new URL(...))`, which Vite turns into a hashed asset.
 * Tauri's CSP is `null`, so the worker loads in both dev and packaged builds.
 */
export const poolOptions: WorkerPoolOptions = {
  workerFactory: () =>
    new Worker(
      new URL("@pierre/diffs/worker/worker-portable.js", import.meta.url),
      { type: "module" },
    ),
  // Pierre's default is 8; more workers = more highlighting throughput while
  // scrolling fast through a large diff.
  poolSize: 8,
};

export const highlighterOptions: WorkerInitializationRenderOptions = {
  theme: { dark: "pierre-dark", light: "pierre-light" },
  langs: [
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
    "make",
  ],
};
