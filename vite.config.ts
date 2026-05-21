import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteStaticCopy } from "vite-plugin-static-copy";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [
    react(),
    // Self-host the VSCode Material file-type icons. The package ships ~900
    // SVGs; copying them to `/material-icons` (served in dev, emitted to the
    // bundle in build) lets `getIconUrlForFilePath(path, "/material-icons")`
    // resolve a real URL. They're separate assets — only the icons actually
    // shown are fetched, so this costs nothing in the JS bundle.
    viteStaticCopy({
      targets: [
        {
          src: "node_modules/vscode-material-icons/generated/icons/*.svg",
          dest: "material-icons",
          // pnpm's symlinked node_modules confuses the glob-base detection, so
          // strip every directory segment and keep just the flat `<name>.svg`.
          rename: { stripBase: true },
        },
      ],
    }),
  ],

  // @pierre/diffs ships its highlighter worker as an ES module that
  // code-splits a wasm chunk, so the worker bundle must be "es" (Vite's
  // default "iife" can't code-split a worker).
  worker: {
    format: "es",
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
