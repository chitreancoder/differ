import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { useEscapeKey } from "@/hooks";
import { computePopoverPlacement } from "@/hooks/usePopoverPlacement";

type Props = {
  /** When false the popover is unmounted (so callers can drop heavy children). */
  open: boolean;
  /** Element to anchor under. May be a mutated ref (e.g. last-hovered chip). */
  triggerRef: RefObject<HTMLElement | null>;
  /** Bump to force a placement recompute when the trigger element changes
   *  identity without remounting (hover-tooltip case where we re-use the same
   *  ref but point it at different chips). */
  placementKey?: string | number | null;
  onClose: () => void;
  /** Popover body width — must match the rendered popover or the arrow drifts. */
  width?: number;
  /** Vertical gap between trigger and popover. */
  gap?: number;
  /** Render a small arrow pointing at the trigger. */
  showArrow?: boolean;
  /** Mousedown anywhere outside the popover AND the trigger calls onClose. */
  dismissOnOutsideClick?: boolean;
  dismissOnEscape?: boolean;
  /** Class applied to the popover's outer element — caller controls chrome. */
  className?: string;
  /** ARIA role — "menu" for click-opened, "tooltip" for hover. */
  role?: string;
  children: ReactNode;
};

/**
 * Single primitive for floating-below-trigger UI. Owns: portal mounting,
 * fixed-viewport placement via computePopoverPlacement, optional arrow,
 * configurable dismiss (outside-click, Escape). The trigger element stays
 * in the parent's DOM; we only render the floating part here.
 */
export function Popover({
  open,
  triggerRef,
  placementKey,
  onClose,
  width = 280,
  gap = 8,
  showArrow = false,
  dismissOnOutsideClick = true,
  dismissOnEscape = true,
  className,
  role = "dialog",
  children,
}: Props) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<{
    left: number;
    top: number;
    arrowLeft: number;
  } | null>(null);

  // Recompute placement whenever we open, the trigger changes identity, the
  // window resizes, or anything in the page scrolls (the trigger may have
  // shifted). `scroll` uses capture phase so we catch nested scroll containers.
  useEffect(() => {
    if (!open) {
      setPlacement(null);
      return;
    }
    const compute = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPlacement(
        computePopoverPlacement({
          trigger: { left: rect.left, right: rect.right, bottom: rect.bottom },
          popoverWidth: width,
          gap,
        }),
      );
    };
    compute();
    window.addEventListener("resize", compute);
    window.addEventListener("scroll", compute, true);
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("scroll", compute, true);
    };
  }, [open, triggerRef, width, gap, placementKey]);

  // Outside-click dismiss: exclude the trigger so its onClick can toggle
  // close→open without us preempting it on mousedown.
  useEffect(() => {
    if (!open || !dismissOnOutsideClick) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, dismissOnOutsideClick, triggerRef, onClose]);

  useEscapeKey(onClose, open && dismissOnEscape);

  if (!open || !placement) return null;

  return createPortal(
    <div
      ref={popoverRef}
      role={role}
      className={`popover ${className ?? ""}`}
      style={{
        position: "fixed",
        left: placement.left,
        top: placement.top,
        width,
        zIndex: 60,
      }}
    >
      {showArrow && (
        <div className="popover-arrow" style={{ left: placement.arrowLeft }} />
      )}
      {children}
    </div>,
    document.body,
  );
}
