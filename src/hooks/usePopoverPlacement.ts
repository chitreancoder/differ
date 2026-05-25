/** Pure placement math for "popover below trigger, arrow centered on trigger".
 *  Returns `{ left, top, arrowLeft }` clamped to the viewport. */

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
  // Bias 60px left of trigger center so the arrow doesn't hug the edge.
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
