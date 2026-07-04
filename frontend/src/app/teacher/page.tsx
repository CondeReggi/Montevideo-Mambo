"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getTodaySessions, ensureTodaySessions, getOldPending, SessionToday, OldPending, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { Shell, PageHeader } from "@/components/ui/TopBar";
import { Button, Card, Badge, Skeleton, EmptyState } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { useRegisterRefresh } from "@/components/Refresh";
import { IconCalendar, IconClock, IconChevron, IconPlus, IconAlert } from "@/components/ui/Icons";

export default function TeacherHome() {
  const { ready } = useAuth(["admin", "teacher"]);
  const toast = useToast();
  const [sessions, setSessions] = useState<SessionToday[]>([]);
  const [oldPending, setOldPending] = useState<OldPending[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    getTodaySessions()
      .then(setSessions)
      .catch((e) => setError(e instanceof ApiError ? e.message : "No se pudo cargar."))
      .finally(() => setLoading(false));
    getOldPending().then(setOldPending).catch(() => setOldPending([]));
  }, []);

  useEffect(() => {
    if (!ready) return;
    load();
  }, [ready, load]);
  useRegisterRefresh(load);

  const generate = async () => {
    setBusy(true);
    try {
      const { count } = await ensureTodaySessions();
      toast.success(count > 0 ? `${count} clase(s) de hoy disponibles.` : "Hoy no hay clases en la grilla.");
      load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo generar.");
    } finally {
      setBusy(false);
    }
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit", hour12: false });
  const fmtDayAgo = (iso: string) => {
    const ms = Date.now() - new Date(iso).getTime();
    const h = Math.floor(ms / 3_600_000);
    return h < 24 ? `hace ${Math.max(1, h)} h` : `hace ${Math.floor(h / 24)} d`;
  };

  if (!ready) return null;

  return (
    <Shell max="max-w-3xl">
      <PageHeader
        eyebrow="Panel del profesor"
        title="Clases de hoy"
        subtitle="Elegí una clase para confirmar o corregir asistencias."
        actions={
          <Button variant="ghost" onClick={generate} loading={busy} icon={<IconPlus />}>
            Generar clases de hoy
          </Button>
        }
      />

      {oldPending.length > 0 && (
        <Card className="mb-5 border-red-500/40 bg-red-500/5 p-4 animate-fade-up">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-red-200">
            <span className="text-red-400"><IconAlert /></span>
            Pendientes de clases ya finalizadas ({oldPending.length})
          </h2>
          <div className="divide-y divide-ink-500/40">
            {oldPending.slice(0, 6).map((o) => (
              <Link
                key={o.attendanceId}
                href={`/teacher/session/${o.sessionId}`}
                className="flex items-center justify-between gap-2 py-2 text-sm transition hover:text-lime"
              >
                <span className="min-w-0 truncate">
                  <b className="font-medium">{o.studentName}</b>
                  <span className="text-muted"> · {o.className}</span>
                </span>
                <Badge tone={o.level === "critical" ? "red" : "amber"}>
                  {fmtDayAgo(o.endAt)}
                </Badge>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {loading && (
        <div className="grid grid-cols-1 gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      )}
      {error && <p className="text-red-400">{error}</p>}
      {!loading && !error && sessions.length === 0 && (
        <EmptyState
          icon={<IconCalendar />}
          title="No hay clases programadas para hoy"
          hint='Tocá "Generar clases de hoy" para crear las sesiones de la grilla del día.'
        />
      )}

      <div className="grid grid-cols-1 gap-3">
        {sessions.map((s) => (
          <Link key={s.id} href={`/teacher/session/${s.id}`}>
            <Card hover className="flex items-center gap-3 p-4 animate-fade-up sm:gap-4">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-lime/15 text-lime">
                <IconCalendar />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{s.className}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-muted">
                  <span className="inline-flex items-center gap-1">
                    <IconClock className="text-xs" /> {fmt(s.startAt)}–{fmt(s.endAt)}
                  </span>
                  <span className="text-muted-dim">·</span> {s.style} · {s.level}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                {s.pendingCount > 0 ? (
                  <Badge tone="amber">{s.pendingCount} pend.</Badge>
                ) : (
                  <Badge tone="lime">Al día</Badge>
                )}
                <span className="text-xs text-muted-dim">{s.confirmedCount} confirm.</span>
              </div>
              <span className="hidden text-muted-dim sm:block">
                <IconChevron />
              </span>
            </Card>
          </Link>
        ))}
      </div>
    </Shell>
  );
}
