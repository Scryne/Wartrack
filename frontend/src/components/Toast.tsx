import { useCallback, useEffect, useRef, useState } from "react";
import { CircleAlert, CircleCheck, Info } from "lucide-react";
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
// Long enough to read a two-line Turkish message; errors stay longer.
const TOAST_DURATION = 4000;
const ERROR_TOAST_DURATION = 7000;

const TYPE_ICONS: Record<ToastType, typeof Info> = {
  success: CircleCheck,
  error: CircleAlert,
  info: Info,
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
      }, type === "error" ? ERROR_TOAST_DURATION : TOAST_DURATION);

      timersRef.current.set(id, timer);
    },
    [removeToast]
  );

  useEffect(() => {
    globalAddToast = addToast;
    const timers = timersRef.current;
    return () => {
      globalAddToast = null;
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
    };
  }, [addToast]);

  // Always mounted: a live region that appears together with its first
  // message is often not announced by screen readers.
  return (
    <div className="wt-toasts" role="status" aria-live="polite">
      {toasts.map((toast) => {
        const Icon = TYPE_ICONS[toast.type];
        return (
          <div key={toast.id} className={cn("wt-toast", toast.exiting ? "toast-exit" : "toast-enter")} data-type={toast.type}>
            <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
            <span>{toast.message}</span>
          </div>
        );
      })}
    </div>
  );
}
