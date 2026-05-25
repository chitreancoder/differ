import { useEffect } from "react";

/** Calls `onEscape` on document keydown. Caller stops propagation if needed. */
export function useEscapeKey(
  onEscape: () => void,
  enabled: boolean = true,
): void {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEscape();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onEscape, enabled]);
}
