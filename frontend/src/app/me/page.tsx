"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/useAuth";
import {
  getMyPanel, getMyQr, getActiveClasses, scanCheckIn,
  StudentPanel, MyQr, ActiveClass, ApiError,
} from "@/lib/api";
import { Shell, PageHeader } from "@/components/ui/TopBar";
import { Card, Stat, Badge, Button, Skeleton, Avatar } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { IconTicket, IconCalendar, IconCash, IconQr, IconCamera, IconClock, IconX } from "@/components/ui/Icons";
import { PassBadge, StatusBadge, fmtDate, kindLabel, debtDisplay } from "@/components/format";
import StudentQr from "@/components/StudentQr";
import QrScanner from "@/components/QrScanner";
import AlertsBanner, { criticalPassIds, warnPassIds } from "@/components/AlertsBanner";

export default function MyPanel() {
  const { ready, session } = useAuth("student");
  const toast = useToast();
  const [panel, setPanel] = useState<StudentPanel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [myQr, setMyQr] = useState<MyQr | null>(null);
  const [active, setActive] = useState<ActiveClass[]>([]);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadPanel = useCallback(() => {
    getMyPanel()
      .then(setPanel)
      .catch((e) => setError(e instanceof ApiError ? e.message : "No se pudo cargar."));
  }, []);
  const loadActive = useCallback(() => {
    getActiveClasses().then(setActive).catch(() => setActive([]));
  }, []);

  useEffect(() => {
    if (!ready) return;
    loadPanel();
    loadActive();
    getMyQr().then(setMyQr).catch(() => setMyQr(null));
  }, [ready, loadPanel, loadActive]);

  const onScan = async (text: string) => {
    if (busy) return;
    setBusy(true);
    setScanning(false);
    try {
      await scanCheckIn(text);
      toast.success("¡Asistencia marcada! Queda pendiente de confirmación del profe.");
      loadPanel();
      loadActive();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo marcar. Volvé a escanear.");
    } finally {
      setBusy(false);
    }
  };
  const fmtHm = (iso: string) =>
    new Date(iso).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit", hour12: false });

  if (!ready) return null;

  const critical = panel ? criticalPassIds(panel.alerts) : new Set<string>();
  const warn = panel ? warnPassIds(panel.alerts) : new Set<string>();

  return (
    <Shell max="max-w-3xl">
      <PageHeader eyebrow="Alumno" title="Mi panel" subtitle="Tu saldo, cuponeras, clases y pagos." />

      {error && <p className="text-red-400">{error}</p>}
      {!panel && !error && (
        <div className="grid grid-cols-1 gap-4">
          <Skeleton className="h-24 w-full" />
          <div className="grid grid-cols-3 gap-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        </div>
      )}

      {panel && (
        <div className="space-y-5">
          <Card className="flex items-center gap-4 p-5 animate-fade-up">
            <Avatar name={panel.summary.fullName} photoUrl={panel.summary.photoUrl} size="lg" ring />
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-2xl tracking-wide">{panel.summary.fullName}</p>
              <p className="truncate text-sm text-muted">{session?.email}</p>
            </div>
          </Card>

          <AlertsBanner alerts={panel.alerts} />

          <div className="grid grid-cols-3 gap-3 animate-fade-up">
            <Stat
              label="Clases restantes"
              value={panel.summary.hasActiveUnlimited ? "∞" : panel.summary.classesRemaining}
              tone="lime"
              icon={<IconTicket />}
            />
            <Stat label="Pendientes" value={panel.summary.pendingAttendances} tone="amber" />
            {(() => {
              const d = debtDisplay(panel.summary);
              return <Stat label="Deuda" value={d.value} hint={d.hint} tone={d.tone} />;
            })()}
          </div>

          {/* Marcar asistencia (Modo B: escaneo el QR de la clase) */}
          <Card className="p-5 animate-fade-up">
            <h2 className="mb-1 flex items-center gap-2 font-semibold">
              <span className="text-lime"><IconCamera /></span> Marcar asistencia
            </h2>
            <p className="mb-4 text-sm text-muted">
              Elegí la clase que estás por tomar y escaneá el QR de la academia.
            </p>

            {scanning ? (
              <div className="space-y-3">
                <QrScanner active={scanning} onScan={onScan} />
                <Button variant="ghost" onClick={() => setScanning(false)} icon={<IconX />} className="mx-auto">
                  Cancelar
                </Button>
              </div>
            ) : active.length === 0 ? (
              <p className="rounded-xl bg-ink-900/40 px-4 py-3 text-sm text-muted-dim">
                No hay clases corriendo en este momento.
              </p>
            ) : (
              <div className="divide-y divide-ink-500/50">
                {active.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 py-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-lime/15 text-lime">
                      <IconClock />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{c.className}</p>
                      <p className="text-xs text-muted">
                        {fmtHm(c.startAt)}–{fmtHm(c.endAt)} · {c.style} · {c.level}
                      </p>
                    </div>
                    <Button className="btn-sm" onClick={() => setScanning(true)} loading={busy} icon={<IconQr />}>
                      Escanear
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Mi QR (Modo A: lo muestro y la recepción lo escanea) */}
          {myQr && (
            <Card className="p-5 animate-fade-up">
              <h2 className="mb-1 flex items-center gap-2 font-semibold">
                <span className="text-lime"><IconQr /></span> Mi QR
              </h2>
              <p className="mb-4 text-sm text-muted">
                Mostrale este código a la recepción para que registre tu asistencia.
              </p>
              <StudentQr code={myQr.qrFixedCode} name={myQr.fullName} />
            </Card>
          )}

          <Section title="Cuponeras" icon={<IconTicket />}>
            {panel.passes.length === 0 && <EmptyRow text="No tenés cuponeras activas." />}
            {panel.passes.map((p) => {
              const isCrit = critical.has(p.id);
              const isWarn = warn.has(p.id);
              return (
                <div
                  key={p.id}
                  className={`flex items-center justify-between py-3 ${
                    isCrit ? "-mx-2 rounded-lg border-l-2 border-red-500/70 bg-red-500/5 px-2" : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <PassBadge kind={p.kind} />
                    <div>
                      <p className="text-sm font-medium">{kindLabel(p.kind)}</p>
                      <p className={`text-xs ${isCrit ? "text-red-300" : "text-muted"}`}>Vence {fmtDate(p.validTo)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-display text-xl ${isCrit ? "text-red-400" : "text-lime"}`}>
                      {p.kind === "UnlimitedMonth" ? "Libre" : p.balance}
                    </p>
                    {!p.isPaid ? (
                      <Badge tone="amber">Impaga ${p.price}</Badge>
                    ) : isCrit ? (
                      <Badge tone="red">Crítico</Badge>
                    ) : isWarn ? (
                      <Badge tone="amber">Atención</Badge>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </Section>

          <Section title="Historial de asistencias" icon={<IconCalendar />}>
            {panel.history.length === 0 && <EmptyRow text="Sin asistencias todavía." />}
            {panel.history.map((h) => (
              <div key={h.id} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-sm font-medium">{h.className}</p>
                  <p className="text-xs text-muted">{fmtDate(h.date)}</p>
                </div>
                <StatusBadge status={h.status} />
              </div>
            ))}
          </Section>

          <Section title="Pagos" icon={<IconCash />}>
            {panel.payments.length === 0 && <EmptyRow text="Sin pagos registrados." />}
            {panel.payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-sm font-medium">{p.concept ?? p.method}</p>
                  <p className="text-xs text-muted">
                    {p.paidAt ? fmtDate(p.paidAt) : "sin fecha"} · {p.method}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-medium">${p.amount}</p>
                  <StatusBadge status={p.status} />
                </div>
              </div>
            ))}
          </Section>
        </div>
      )}
    </Shell>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="p-5 animate-fade-up">
      <h2 className="mb-1 flex items-center gap-2 font-semibold">
        <span className="text-lime">{icon}</span>
        {title}
      </h2>
      <div className="divide-y divide-ink-500/50">{children}</div>
    </Card>
  );
}
function EmptyRow({ text }: { text: string }) {
  return <p className="py-3 text-sm text-muted-dim">{text}</p>;
}
