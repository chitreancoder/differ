import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { computePopoverPlacement } from "@/hooks/usePopoverPlacement";

const originalInnerWidth = window.innerWidth;

describe("computePopoverPlacement", () => {
  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 1200,
    });
  });
  afterEach(() => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: originalInnerWidth,
    });
  });

  it("anchors below the trigger with the configured gap", () => {
    const { top } = computePopoverPlacement({
      trigger: { left: 400, right: 460, bottom: 100 },
      popoverWidth: 280,
      gap: 8,
    });
    expect(top).toBe(108);
  });

  it("biases the popover so the arrow lands near the trigger center", () => {
    const { left, arrowLeft } = computePopoverPlacement({
      trigger: { left: 400, right: 460, bottom: 100 },
      popoverWidth: 280,
    });
    // Trigger center is 430; bias places `left` at 430-60 = 370.
    expect(left).toBe(370);
    // Arrow sits under the trigger center, so 430 - 370 = 60 from popover's left.
    expect(arrowLeft).toBe(60);
  });

  it("clamps the popover inside the viewport on the right edge", () => {
    const { left, arrowLeft } = computePopoverPlacement({
      trigger: { left: 1140, right: 1180, bottom: 100 },
      popoverWidth: 280,
      viewportMargin: 8,
    });
    // 1200 - 280 - 8 = 912 is the max left.
    expect(left).toBe(912);
    // Arrow still points at the trigger's true center despite the clamp.
    const triggerCenter = 1160;
    expect(arrowLeft).toBe(triggerCenter - 912);
  });

  it("clamps the popover inside the viewport on the left edge", () => {
    const { left } = computePopoverPlacement({
      trigger: { left: 20, right: 60, bottom: 100 },
      popoverWidth: 280,
      viewportMargin: 8,
    });
    expect(left).toBe(8);
  });

  it("clamps the arrow away from the popover's edges", () => {
    const { arrowLeft } = computePopoverPlacement({
      trigger: { left: 0, right: 4, bottom: 100 },
      popoverWidth: 280,
      arrowEdgeInset: 18,
    });
    expect(arrowLeft).toBeGreaterThanOrEqual(18);
    expect(arrowLeft).toBeLessThanOrEqual(280 - 18);
  });
});
