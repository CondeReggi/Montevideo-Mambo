"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/useAuth";
import { getDisplayActive, DisplaySession, ApiError } from "@/lib/api";
import { Shell, PageHeader } from "@/components/ui/TopBar";
import { Card, EmptyState } from "@/components/ui";
import { useRegisterRefresh } from "@/components/Refresh";
import { IconCalendar, IconQr } from "@/components/ui/Icons";
import QrImage from "@/components/QrImage";

/**
 * Pantalla para mostrar en la academia (Modo B): un QR DINÁMICO por clase activa.
 * El alumno lo escanea desde su cuenta para marcar asistencia. El token rota cada ~60s,
 * por eso refrescamos cada 15s (queda siempre fresco).
 */
export default function DisplayScreen() {
  const { ready } = useAuth(["admin", "teacher"]); // recepción/profe/admin
  const [sessions, setSessions] = useState<DisplaySession[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    getDisplayActive()
      .then((r) => { setSessions(r.sessions); setError(null); })
      .catch((e) => setError(e instanceof ApiError ? e.message : "No se pudo cargar."));
  }, []);

  useEffect(() => {
    if (!ready) return;
    load();
    const t = setInterval(load, 15000); // refresco del token rotativo
    return () => clearInterval(t);
  }, [ready, load]);
  useRegisterRefresh(load);

  const fmtHm = (iso: string) =>
    new Date(iso).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit", hour12: false });

  if (!ready) return null;

  return (
    <Shell>
      <PageHeader
        eyebrow="Academia · Modo B"
        title="Escaneá para marcar asistencia"
        subtitle="Abrí Mi panel en tu celular, elegí la clase y escaneá el QR de tu clase."
      />

      {error && <p className="text-red-400">{error}</p>}
      {sessions !== null && sessions.length === 0 && (
        <EmptyState
          icon={<IconCalendar />}
          title="No hay clases corriendo ahora"
          hint="El QR aparece cuando una clase está activa (desde el inicio hasta 30 min después de finalizar)."
        />
      )}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {sessions?.map((s) => (
          <Card key={s.id} className="flex flex-col items-center p-5 text-center animate-fade-up sm:p-6">
            <p className="eyebrow mb-1 flex items-center gap-1.5">
              <IconQr /> {fmtHm(s.startAt)}–{fmtHm(s.endAt)}
            </p>
            <h2 className="mb-4 break-words font-display text-xl tracking-wide text-lime sm:text-2xl">{s.className}</h2>
            <div className="w-full max-w-[300px] rounded-3xl bg-white p-3 shadow-panel sm:p-4">
              <QrImage value={s.token} size={320} />
            </div>
            <p className="mt-3 text-sm text-muted">{s.style} · {s.level}</p>
          </Card>
        ))}
      </div>
    </Shell>
  );
}
