import React, { useEffect, useRef } from "react";

type DrawerProps = {
  isOpen: boolean;
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
};

const Drawer: React.FC<DrawerProps> = ({ isOpen, title, onClose, children }) => {
  const panelRef = useRef<HTMLDivElement>(null);
  // Куда вернуть фокус после закрытия — на элемент, из которого панель открыли.
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  // onClose в ref, чтобы эффект ниже не перезапускался на каждый рендер родителя.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    // Escape закрывает, фокус переезжает в панель: без этого с клавиатуры панель ни
    // открыть по-настоящему, ни закрыть — а после закрытия человек терял место в списке.
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseRef.current();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      restoreFocusRef.current?.focus?.();
    };
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="admin-drawer" onClick={onClose}>
      <div
        className="admin-drawer__panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={panelRef}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3>{title}</h3>
          <button className="btn btn-outline" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

export default Drawer;
