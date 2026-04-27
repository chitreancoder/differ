import { forwardRef, useImperativeHandle, useRef } from "react";
import type { FileEntry, DiffStyle } from "../types";
import { FileDiff } from "./FileDiff";
import { fileAnchorId } from "../utils/diff";

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
  const scrollRef = useRef<HTMLDivElement>(null);

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
    <div ref={scrollRef} className="diff-list">
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
    </div>
  );
});
