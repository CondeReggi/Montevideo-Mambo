import { Badge } from "@/components/ui";
import { IconTicket, IconSpark, IconCalendar } from "@/components/ui/Icons";

/* Etiquetas legibles en español para enums del backend. */
export const KIND_ES: Record<string, string> = {
  ClassPack: "Pack de clases",
  UnlimitedMonth: "Pase libre mensual",
  SingleClass: "Clase suelta",
};
export const STATUS_ES: Record<string, string> = {
  Pending: "Pendiente",
  Confirmed: "Confirmada",
  Rejected: "Rechazada",
  Corrected: "Corregida",
  Cancelled: "Cancelada",
  Active: "Activa",
  Expired: "Vencida",
  Exhausted: "Agotada",
};
export const WEEKDAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export const kindLabel = (k: string) => KIND_ES[k] ?? k;
export const statusLabel = (s: string) => STATUS_ES[s] ?? s;

/** Deuda del alumno para un tile "Deuda": muestra la PLATA (cuponeras impagas) y las
 * clases adeudadas juntas. */
export function debtDisplay(s: { debtMoney: number; debtClasses: number }): {
  value: string | number;
  hint?: string;
  tone: "red" | "default";
} {
  const money = s.debtMoney ?? 0;
  const cls = s.debtClasses ?? 0;
  const has = money > 0 || cls > 0;
  return {
    value: money > 0 ? `$${money}` : cls,
    hint: money > 0 && cls > 0 ? `+ ${cls} clase(s)` : money === 0 && cls > 0 ? "en clases" : undefined,
    tone: has ? "red" : "default",
  };
}

/** Formatea una fecha ISO (yyyy-mm-dd o completa) al formato uruguayo. */
export function fmtDate(iso: string): string {
  try {
    const d = iso.length <= 10 ? new Date(iso + "T00:00:00") : new Date(iso);
    return d.toLocaleDateString("es-UY", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

// Etiquetas en español de los tipos de contenido de difusión.
export const CONTENT_TYPE_ES: Record<string, string> = {
  News: "Noticia",
  Update: "Novedad",
  Showcase: "Muestra",
  Workshop: "Taller",
  Event: "Evento",
};
export const contentTypeLabel = (t: string) => CONTENT_TYPE_ES[t] ?? t;

/**
 * URL para abrir una ubicación en el mapa. Prioriza coordenadas (más preciso); si no
 * hay, usa la dirección de texto. El esquema geo:/maps genérico deja que el dispositivo
 * elija Google Maps (Android) o Apple Maps (iOS). Devuelve null si no hay ubicación.
 */
export function mapUrl(loc: {
  latitude?: number | null; longitude?: number | null; locationAddress?: string | null; locationName?: string | null;
}): string | null {
  if (loc.latitude != null && loc.longitude != null)
    return `https://www.google.com/maps/search/?api=1&query=${loc.latitude},${loc.longitude}`;
  const text = loc.locationAddress || loc.locationName;
  return text ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text)}` : null;
}

export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "Confirmed" || status === "Active"
      ? "lime"
      : status === "Pending"
        ? "amber"
        : status === "Rejected" || status === "Cancelled" || status === "Expired" || status === "Exhausted"
          ? "red"
          : "muted";
  return <Badge tone={tone as "lime" | "amber" | "red" | "muted"}>{statusLabel(status)}</Badge>;
}

export function PassBadge({ kind }: { kind: string }) {
  const icon = kind === "UnlimitedMonth" ? <IconSpark /> : kind === "SingleClass" ? <IconCalendar /> : <IconTicket />;
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-lime/15 text-lime">
      {icon}
    </span>
  );
}
