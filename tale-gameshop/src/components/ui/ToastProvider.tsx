import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

type ToastVariant = "success" | "error" | "info";

type ToastAction = {
  label: string;
  onClick: () => void;
};

type ToastOptions = {
  // Сколько держать тост на экране (мс). По умолчанию: 6000 если есть action, иначе 2500.
  durationMs?: number;
  // Кнопка действия внутри тоста (например «Перейти к редактированию»).
  action?: ToastAction;
  // Полоска-прогресс снизу тоста, которая истекает к авто-закрытию. По умолчанию включена, если есть action.
  showProgress?: boolean;
};

type Toast = {
  id: number;
  message: string;
  variant: ToastVariant;
  durationMs: number;
  action?: ToastAction;
  showProgress: boolean;
};

type ToastContextValue = {
  addToast: (message: string, variant?: ToastVariant, options?: ToastOptions) => void;
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counterRef = useRef(0);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const addToast = useCallback(
    (message: string, variant: ToastVariant = "success", options?: ToastOptions) => {
      counterRef.current += 1;
      const id = counterRef.current;
      const durationMs = options?.durationMs ?? (options?.action ? 6000 : 2500);
      const showProgress = options?.showProgress ?? Boolean(options?.action);
      setToasts((prev) => [
        ...prev,
        { id, message, variant, durationMs, action: options?.action, showProgress },
      ]);
      window.setTimeout(() => removeToast(id), durationMs);
    },
    [removeToast]
  );

  const value = useMemo(() => ({ addToast }), [addToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="admin-toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`admin-toast ${toast.variant}`}>
            <div className="admin-toast__body">
              <span className="admin-toast__message">{toast.message}</span>
              {toast.action && (
                <button
                  type="button"
                  className="admin-toast__action"
                  onClick={() => {
                    toast.action?.onClick();
                    removeToast(toast.id);
                  }}
                >
                  {toast.action.label}
                </button>
              )}
              <button
                type="button"
                className="admin-toast__close"
                aria-label="Закрыть"
                onClick={() => removeToast(toast.id)}
              >
                ×
              </button>
            </div>
            {toast.showProgress && (
              <span
                className="admin-toast__progress"
                style={{ animationDuration: `${toast.durationMs}ms` }}
              />
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
};
