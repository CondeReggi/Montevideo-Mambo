"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { IconCheck, IconAlert, IconX } from "./Icons";

type ToastKind = "success" | "error" | "info";
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  show: (message: string, kind?: ToastKind) => void;
  success: (m: string) => void;
  error: (m: string) => void;
  info: (m: string) => void;
}

const Ctx = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast debe usarse dentro de <ToastProvider>");
  return ctx;
}

let counter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const show = useCallback(
    (message: string, kind: ToastKind = "info") => {
      const id = ++counter;
      setToasts((t) => [...t, { id, kind, message }]);
      setTimeout(() => remove(id), 4200);
    },
    [remove],
  );

  const api: ToastApi = {
    show,
    success: (m) => show(m, "success"),
    error: (m) => show(m, "error"),
    info: (m) => show(m, "info"),
  };

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onClose={() => remove(t.id)} />
        ))}
      </div>
    </Ctx.Provider>
  );
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const tone =
    toast.kind === "success"
      ? "border-lime/50 bg-ink-800 text-lime"
      : toast.kind === "error"
        ? "border-red-500/50 bg-ink-800 text-red-300"
        : "border-ink-500 bg-ink-800 text-foreground";
  const Icon = toast.kind === "error" ? IconAlert : toast.kind === "success" ? IconCheck : IconAlert;
  return (
    <div
      className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border ${tone} px-4 py-3 shadow-panel animate-fade-up`}
      role="status"
    >
      <span className="mt-0.5 text-base">
        <Icon />
      </span>
      <p className="flex-1 text-sm font-medium text-foreground">{toast.message}</p>
      <button onClick={onClose} className="text-muted transition hover:text-foreground">
        <IconX />
      </button>
    </div>
  );
}
