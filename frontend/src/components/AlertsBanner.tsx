import { AlertItem } from "@/lib/api";
import { IconAlert } from "@/components/ui/Icons";

/** Lista de recordatorios/avisos: crítico en rojo, aviso en ámbar. */
export default function AlertsBanner({ alerts }: { alerts: AlertItem[] }) {
  if (!alerts || alerts.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-2 animate-fade-up">
      {alerts.map((a, i) => (
        <div
          key={i}
          className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm ${
            a.level === "critical"
              ? "border-red-500/40 bg-red-500/10 text-red-200"
              : "border-amber-400/40 bg-amber-400/10 text-amber-200"
          }`}
        >
          <span className={a.level === "critical" ? "text-red-400" : "text-amber-300"}>
            <IconAlert />
          </span>
          {a.message}
        </div>
      ))}
    </div>
  );
}

/** Ids de cuponeras con aviso crítico (para resaltar la fila en rojo). */
export function criticalPassIds(alerts: AlertItem[]): Set<string> {
  return new Set(alerts.filter((a) => a.level === "critical" && a.passId).map((a) => a.passId as string));
}
export function warnPassIds(alerts: AlertItem[]): Set<string> {
  return new Set(alerts.filter((a) => a.level === "warn" && a.passId).map((a) => a.passId as string));
}
