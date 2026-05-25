/**
 * Pure placement math for a "popover below trigger, arrow centered on
 * trigger" layout — separated from any DOM/React lifecycle so it's trivial to
 * unit-test and reuse across the Popover primitive, CommitTooltip, etc.
 *
 * Returns absolute viewport coords:
 *   - `left`/`top`: where to anchor the popover (clamped to stay on-screen)
 *   - `arrowLeft`: where to render the arrow inside the popover (so it lines
 *     up with the trigger's center, clamped to the popover's body)
 */

export type PlacementInput = {
  trigger: { left: number; right: number; bottom: number };
  popoverWidth: number;
  /** Vertical gap between trigger and popover. */
  gap?: number;
  /** Margin reserved from the window edges. */
  viewportMargin?: number;
  /** How far the arrow base can sit from the popover's edges. */
  arrowEdgeInset?: number;
};

export type Placement = {
  left: number;
  top: number;
  arrowLeft: number;
};

export function computePopoverPlacement({
  trigger,
  popoverWidth,
  gap = 8,
  viewportMargin = 8,
  arrowEdgeInset = 18,
}: PlacementInput): Placement {
  const triggerCenterX = (trigger.left + trigger.right) / 2;
  const maxLeft = window.innerWidth - popoverWidth - viewportMargin;
  // Bias the popover so its left starts about 60px left of the trigger
  // center — gives the arrow a natural offset from the popover's left edge.
  const left = Math.max(
    viewportMargin,
    Math.min(maxLeft, triggerCenterX - 60),
  );
  const arrowLeft = Math.max(
    arrowEdgeInset,
    Math.min(popoverWidth - arrowEdgeInset, triggerCenterX - left),
  );
  return { left, top: trigger.bottom + gap, arrowLeft };
}
