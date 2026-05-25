import { useEffect, type RefObject } from "react";

/**
 * Fires `onOutside` when a `mousedown` lands outside `ref.current`. Disabled
 * via `enabled=false` so callers can gate it on their own `open` state
 * without conditionally calling the hook.
 */
export function useClickOutside(
  ref: RefObject<HTMLElement | null>,
  onOutside: () => void,
  enabled: boolean = true,
): void {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: MouseEvent) => {
      const el = ref.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) onOutside();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ref, onOutside, enabled]);
}
