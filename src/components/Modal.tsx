import { createPortal } from "react-dom";
import { useEscapeKey } from "@/hooks";
import "./Modal.css";

type Props = {
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
};

export function Modal({ onClose, children, width = 480 }: Props) {
  useEscapeKey(onClose);

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ width }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
