import { useEffect, type RefObject } from "react";

/**
 * Focus the referenced element whenever `active` becomes truthy. The
 * `setTimeout(0)` skip lets the element commit before focus is moved — needed
 * for modals that mount the input in the same render they open. When `active`
 * is true on mount, focus runs once after the first commit.
 */
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
