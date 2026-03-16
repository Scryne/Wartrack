import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "../lib/utils";

/* ── Types ── */
export type ToastType = "success" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
  exiting: boolean;
}

let toastIdCounter = 0;
let globalAddToast: ((message: string, type?: ToastType) => void) | null = null;

/**
 * Show a toast from anywhere in the app.
 * Must have <ToastContainer /> mounted.
 */
export function showToast(message: string, type: ToastType = "info"): void {
  globalAddToast?.(message, type);
}

/* ── Container Component ── */
const TOAST_DURATION = 3000;

const TYPE_STYLES: Record<ToastType, string> = {
  success: "border-success bg-success/10 text-success",
  error: "border-danger bg-danger/10 text-danger",
  info: "border-accent bg-accent/10 text-accent",
};

const TYPE_ICONS: Record<ToastType, string> = {
  success: "✓",
  error: "✕",
  info: "ℹ",
};

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: number) => {
    // Start exit animation
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
    );

    // Remove after animation
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 250);
  }, []);

  const addToast = useCallback(
    (message: string, type: ToastType = "info") => {
      const id = ++toastIdCounter;
      setToasts((prev) => [...prev.slice(-4), { id, message, type, exiting: false }]);

      const timer = setTimeout(() => {
        removeToast(id);
        timersRef.current.delete(id);
      }, TOAST_DURATION);

      timersRef.current.set(id, timer);
    },
    [removeToast]
  );

  useEffect(() => {
    globalAddToast = addToast;
    return () => {
      globalAddToast = null;
      for (const timer of timersRef.current.values()) {
        clearTimeout(timer);
      }
    };
  }, [addToast]);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-14 right-4 z-[9999] flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            "pointer-events-auto flex items-center gap-2 rounded-[var(--radius-md)] border px-4 py-2.5 font-mono text-[12px] shadow-lg backdrop-blur-sm",
            TYPE_STYLES[toast.type],
            toast.exiting ? "toast-exit" : "toast-enter"
          )}
        >
          <span className="text-[14px]">{TYPE_ICONS[toast.type]}</span>
          <span className="max-w-[280px] truncate">{toast.message}</span>
        </div>
      ))}
    </div>
  );
}
