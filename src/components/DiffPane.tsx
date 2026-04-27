import { forwardRef, useImperativeHandle, useState } from "react";
import type { FileEntry, DiffStyle } from "../types";
import { FileDiff } from "./FileDiff";
import { fileAnchorId } from "../utils/diff";
import { LoadObserver, VisibilityObserver } from "./intersection";

type Props = {
  files: FileEntry[];
  repoPath: string;
  base: string;
  compare: string;
  selectedCommit: string | null;
  diffStyle: DiffStyle;
  onVisibleFileChange: (path: string) => void;
};

export type DiffPaneHandle = {
  scrollToFile: (path: string) => void;
};

export const DiffPane = forwardRef<DiffPaneHandle, Props>(function DiffPane(
  {
    files,
    repoPath,
    base,
    compare,
    selectedCommit,
    diffStyle,
    onVisibleFileChange,
  },
  ref,
) {
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      scrollToFile(path: string) {
        const el = document.getElementById(fileAnchorId(path));
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      },
    }),
    [],
  );

  return (
    <div ref={setScrollEl} className="diff-list">
      {scrollEl && (
        <LoadObserver.Provider
          root={scrollEl}
          options={{ rootMargin: "300px 0px" }}
        >
          <VisibilityObserver.Provider
            root={scrollEl}
            options={{ rootMargin: "0px 0px -70% 0px", threshold: 0 }}
          >
            {files.map((file) => (
              <FileDiff
                key={file.path}
                file={file}
                repoPath={repoPath}
                base={base}
                compare={compare}
                selectedCommit={selectedCommit}
                diffStyle={diffStyle}
                onVisible={onVisibleFileChange}
              />
            ))}
          </VisibilityObserver.Provider>
        </LoadObserver.Provider>
      )}
    </div>
  );
});
