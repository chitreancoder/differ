import { useEffect, type RefObject } from "react";

/** Focus `ref.current` when `active` becomes truthy. The `setTimeout(0)`
 *  lets the element mount before focus is moved. */
export function useAutoFocus(
  ref: RefObject<HTMLElement | null>,
  active: boolean = true,
): void {
  useEffect(() => {
    if (!active) return;
    const id = window.setTimeout(() => ref.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [ref, active]);
}
