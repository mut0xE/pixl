"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type ToastKind = "error" | "success" | "info";

export type Toast = {
  id: number;
  kind: ToastKind;
  title: string;
  detail?: string;
};

type ToastInput = { title: string; detail?: string; kind?: ToastKind };

type ToastApi = {
  push: (t: ToastInput) => void;
  error: (title: string, detail?: string) => void;
  success: (title: string, detail?: string) => void;
  info: (title: string, detail?: string) => void;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const TOAST_ICON: Record<ToastKind, string> = {
  error: "✕",
  success: "✓",
  info: "i",
};

// Errors linger; success/info self-dismiss quickly.
const TTL: Record<ToastKind, number> = {
  error: 9000,
  success: 4500,
  info: 5000,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const handle = timers.current.get(id);
    if (handle) {
      clearTimeout(handle);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    ({ title, detail, kind = "info" }: ToastInput) => {
      const id = ++seq.current;
      setToasts((list) => [...list, { id, kind, title, detail }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), TTL[kind])
      );
    },
    [dismiss]
  );

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((h) => clearTimeout(h));
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      push,
      dismiss,
      error: (title, detail) => push({ title, detail, kind: "error" }),
      success: (title, detail) => push({ title, detail, kind: "success" }),
      info: (title, detail) => push({ title, detail, kind: "info" }),
    }),
    [push, dismiss]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-stack" role="region" aria-label="Notifications">
        {toasts.map((t) => (
          <div key={t.id} className="toast" data-kind={t.kind} role="alert">
            <span className="toast__icon" aria-hidden>
              {TOAST_ICON[t.kind]}
            </span>
            <div className="toast__body">
              <strong className="toast__title">{t.title}</strong>
              {t.detail && <span className="toast__detail">{t.detail}</span>}
            </div>
            <button
              className="toast__close"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
