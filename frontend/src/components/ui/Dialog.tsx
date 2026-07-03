"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Button } from "./index";

type Tone = "danger" | "primary";

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: Tone;
}
interface PromptField {
  name: string;
  label: string;
  type?: "text" | "number" | "textarea";
  defaultValue?: string;
  placeholder?: string;
}
interface PromptOptions {
  title: string;
  message?: string;
  fields: PromptField[];
  confirmLabel?: string;
  cancelLabel?: string;
}

type PromptResult = Record<string, string> | null;

type State =
  | { kind: "confirm"; opts: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: "prompt"; opts: PromptOptions; resolve: (v: PromptResult) => void }
  | null;

interface DialogApi {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  /** Devuelve un objeto {name: value} o null si se canceló. */
  prompt: (opts: PromptOptions) => Promise<PromptResult>;
}

const DialogContext = createContext<DialogApi | null>(null);

export function useDialog(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useDialog debe usarse dentro de <DialogProvider>.");
  return ctx;
}

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>(null);

  const confirm = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => setState({ kind: "confirm", opts, resolve })),
    [],
  );
  const prompt = useCallback(
    (opts: PromptOptions) =>
      new Promise<PromptResult>((resolve) => setState({ kind: "prompt", opts, resolve })),
    [],
  );

  const close = useCallback(
    (result: boolean | PromptResult) => {
      setState((s) => {
        if (!s) return null;
        if (s.kind === "confirm") s.resolve(result as boolean);
        else s.resolve(result as PromptResult);
        return null;
      });
    },
    [],
  );

  return (
    <DialogContext.Provider value={{ confirm, prompt }}>
      {children}
      {state && <DialogModal state={state} onClose={close} />}
    </DialogContext.Provider>
  );
}

function DialogModal({
  state,
  onClose,
}: {
  state: NonNullable<State>;
  onClose: (result: boolean | PromptResult) => void;
}) {
  const isPrompt = state.kind === "prompt";
  const firstRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const [values, setValues] = useState<Record<string, string>>(() =>
    isPrompt
      ? Object.fromEntries(state.opts.fields.map((f) => [f.name, f.defaultValue ?? ""]))
      : {},
  );

  const cancel = useCallback(() => onClose(isPrompt ? null : false), [isPrompt, onClose]);
  const accept = useCallback(() => onClose(isPrompt ? values : true), [isPrompt, values, onClose]);

  useEffect(() => {
    firstRef.current?.focus();
    firstRef.current?.select?.();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancel();
      else if (e.key === "Enter" && !(e.target instanceof HTMLTextAreaElement)) accept();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cancel, accept]);

  const tone = state.kind === "confirm" ? state.opts.tone ?? "primary" : "primary";

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-black/70 p-4 backdrop-blur-sm animate-fade-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) cancel();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="card w-full max-w-md p-6 animate-fade-up">
        <h2 className="font-display text-xl tracking-wide">{state.opts.title}</h2>
        {state.opts.message && <p className="mt-2 text-sm text-muted">{state.opts.message}</p>}

        {state.kind === "prompt" && (
          <div className="mt-4 grid grid-cols-1 gap-3">
            {state.opts.fields.map((f, i) => (
              <label key={f.name} className="block">
                <span className="label">{f.label}</span>
                {f.type === "textarea" ? (
                  <textarea
                    ref={i === 0 ? (el) => { firstRef.current = el; } : undefined}
                    className="field min-h-[80px] resize-y"
                    value={values[f.name] ?? ""}
                    placeholder={f.placeholder}
                    onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                  />
                ) : (
                  <input
                    ref={i === 0 ? (el) => { firstRef.current = el; } : undefined}
                    className="field"
                    type={f.type ?? "text"}
                    value={values[f.name] ?? ""}
                    placeholder={f.placeholder}
                    onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                  />
                )}
              </label>
            ))}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={cancel}>
            {state.opts.cancelLabel ?? "Cancelar"}
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} onClick={accept}>
            {state.opts.confirmLabel ?? (state.kind === "confirm" ? "Confirmar" : "Aceptar")}
          </Button>
        </div>
      </div>
    </div>
  );
}
