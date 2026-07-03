"use client";

import { ButtonHTMLAttributes, ReactNode } from "react";

/* ------------------------------ Button ------------------------------ */
type Variant = "primary" | "ghost" | "danger";
export function Button({
  variant = "primary",
  loading = false,
  icon,
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  loading?: boolean;
  icon?: ReactNode;
}) {
  const cls =
    variant === "primary" ? "btn-primary" : variant === "danger" ? "btn-danger" : "btn-ghost";
  return (
    <button className={`${cls} ${className}`} disabled={loading || rest.disabled} {...rest}>
      {loading ? <Spinner className="h-4 w-4" /> : icon}
      {children}
    </button>
  );
}

/* ------------------------------ Spinner ----------------------------- */
export function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <span
      className={`inline-block animate-spin-slow rounded-full border-2 border-current border-t-transparent ${className}`}
      aria-label="Cargando"
    />
  );
}

/* ------------------------------ Card -------------------------------- */
export function Card({
  children,
  className = "",
  hover = false,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return <div className={`card ${hover ? "card-hover" : ""} ${className}`}>{children}</div>;
}

/* ------------------------------ Stat tile --------------------------- */
export function Stat({
  label,
  value,
  hint,
  tone = "default",
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "default" | "lime" | "amber" | "red";
  icon?: ReactNode;
}) {
  const valueTone =
    tone === "lime"
      ? "text-lime"
      : tone === "amber"
        ? "text-amber-300"
        : tone === "red"
          ? "text-red-400"
          : "text-foreground";
  return (
    <div className="rounded-xl border border-ink-500/70 bg-ink-900/60 p-4">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</span>
        {icon && <span className="text-muted-dim">{icon}</span>}
      </div>
      <p className={`font-display text-3xl leading-none ${valueTone}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-dim">{hint}</p>}
    </div>
  );
}

/* ------------------------------ Avatar ------------------------------ */
export function Avatar({
  name,
  photoUrl,
  size = "md",
  ring = false,
}: {
  name: string;
  photoUrl?: string | null;
  size?: "sm" | "md" | "lg";
  ring?: boolean;
}) {
  const dim = size === "lg" ? "h-16 w-16 text-xl" : size === "sm" ? "h-9 w-9 text-xs" : "h-12 w-12 text-sm";
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const ringCls = ring ? "ring-2 ring-lime/60 ring-offset-2 ring-offset-ink-800" : "";
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={name}
        className={`${dim} ${ringCls} shrink-0 rounded-full border border-ink-500 object-cover`}
      />
    );
  }
  return (
    <div
      className={`${dim} ${ringCls} grid shrink-0 place-items-center rounded-full bg-lime-grad font-bold text-ink-900`}
    >
      {initials}
    </div>
  );
}

/* ------------------------------ Badge ------------------------------- */
export function Badge({
  tone = "muted",
  children,
}: {
  tone?: "lime" | "amber" | "red" | "muted";
  children: ReactNode;
}) {
  const cls =
    tone === "lime" ? "chip-lime" : tone === "amber" ? "chip-amber" : tone === "red" ? "chip-red" : "chip-muted";
  return <span className={cls}>{children}</span>;
}

/* ------------------------------ Skeleton ---------------------------- */
export function Skeleton({ className = "h-4 w-full" }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-lg bg-ink-700 ${className}`}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/5 to-transparent" />
    </div>
  );
}

/* ------------------------------ EmptyState -------------------------- */
export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink-500 bg-ink-900/40 px-6 py-12 text-center">
      {icon && <div className="mb-3 text-3xl text-muted-dim">{icon}</div>}
      <p className="font-semibold text-muted-soft">{title}</p>
      {hint && <p className="mt-1 max-w-xs text-sm text-muted-dim">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ------------------------------ Field ------------------------------- */
export function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "type">) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input
        className="field"
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        {...rest}
      />
    </label>
  );
}
