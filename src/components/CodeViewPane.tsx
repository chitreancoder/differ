import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import {
  CodeView,
  WorkerPoolContextProvider,
  type CodeViewHandle,
  type CodeViewItem,
} from "@pierre/diffs/react";
import { parsePatchFiles } from "@pierre/diffs";
import type { DiffStyle } from "../types";
import type { Theme } from "../theme";
import { poolOptions, highlighterOptions } from "../diffs/workerPool";

/**
 * Injected *into each file's Shadow DOM* via the `unsafeCSS` option — plain
 * App.css can't reach the header because it lives behind the shadow boundary.
 * Promoting the sticky header to its own compositor layer stops WKWebView
 * (Tauri/macOS) from repainting it out of sync with the scrolling code.
 */
const STICKY_HEADER_FIX =
  "[data-diffs-header][data-sticky]{will-change:transform;transform:translateZ(0)}";

export type CodeViewPaneHandle = {
  scrollToFile: (path: string) => void;
};

type Props = {
  patch: string;
  /** Stable per-comparison key — doubles as the worker-pool highlight cache prefix. */
  scopeKey: string;
  diffStyle: DiffStyle;
  theme: Theme;
};

export const CodeViewPane = forwardRef<CodeViewPaneHandle, Props>(
  function CodeViewPane({ patch, scopeKey, diffStyle, theme }, ref) {
    const viewRef = useRef<CodeViewHandle<undefined>>(null);

    const items = useMemo<CodeViewItem[]>(() => {
      const parsed = parsePatchFiles(patch, scopeKey);
      return parsed
        .flatMap((p) => p.files)
        .map((fileDiff) => ({
          id: fileDiff.name,
          type: "diff" as const,
          fileDiff,
        }));
    }, [patch, scopeKey]);

    useImperativeHandle(
      ref,
      () => ({
        scrollToFile(path: string) {
          viewRef.current?.scrollTo({
            type: "line",
            id: path,
            lineNumber: 1,
            align: "start",
          });
        },
      }),
      [],
    );

    return (
      <WorkerPoolContextProvider
        poolOptions={poolOptions}
        highlighterOptions={highlighterOptions}
      >
        <CodeView
          ref={viewRef}
          items={items}
          className="codeview"
          style={{ height: "100%" }}
          options={{
            diffStyle,
            themeType: theme,
            // "scroll" keeps every row a uniform height so the virtualizer
            // knows exact offsets and skips post-render height reconciliation —
            // smoothest scrolling. Long lines scroll horizontally per file.
            overflow: "scroll",
            stickyHeaders: true,
            unsafeCSS: STICKY_HEADER_FIX,
          }}
        />
      </WorkerPoolContextProvider>
    );
  },
);
