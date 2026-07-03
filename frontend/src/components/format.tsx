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

/** Formatea una fecha ISO (yyyy-mm-dd o completa) al formato uruguayo. */
export function fmtDate(iso: string): string {
  try {
    const d = iso.length <= 10 ? new Date(iso + "T00:00:00") : new Date(iso);
    return d.toLocaleDateString("es-UY", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
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
