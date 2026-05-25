import { useEffect } from "react";

/**
 * Calls `onEscape` when the Escape key is pressed. Listens on document so it
 * catches keypresses regardless of where focus is. Disable with `enabled=false`
 * to gate on an `open` state without conditionally calling the hook.
 *
 * The listener uses `keydown` (not `keyup`) for snappy dismiss feel. Callers
 * that need to swallow propagation (e.g. nested modal-in-modal) should call
 * `e.stopPropagation()` inside their `onEscape` — we don't do it here so the
 * default behavior stays composable.
 */
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
