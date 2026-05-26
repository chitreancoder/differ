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
import "./Popover.css";

type Props = {
  open: boolean;
  triggerRef: RefObject<HTMLElement | null>;
  /** Bump to force a placement recompute when the trigger element changes
   *  identity without remounting (e.g. hover tooltip re-pointing at chips). */
  placementKey?: string | number | null;
  onClose: () => void;
  width?: number;
  gap?: number;
  showArrow?: boolean;
  dismissOnOutsideClick?: boolean;
  dismissOnEscape?: boolean;
  className?: string;
  /** "menu" for click-opened, "tooltip" for hover. */
  role?: string;
  children: ReactNode;
};

/** Portal-mounted popover anchored below `triggerRef` via
 *  computePopoverPlacement. The trigger stays in the parent's DOM. */
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

  // Recompute on open / trigger swap / resize / any scroll (the trigger
  // may have moved). Capture phase catches nested scroll containers.
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

  // Exclude the trigger from outside-click so its onClick can toggle
  // close→open without our mousedown firing first.
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
