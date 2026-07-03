"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/useAuth";
import {
  listStudents,
  listClasses,
  listDebtors,
  getTodaySessions,
  ensureTodaySessions,
  getAdminAlerts,
  seedHorarios,
  StudentRow,
  ClassRow,
  Debtor,
  SessionToday,
  StudentRisk,
  OldPending,
} from "@/lib/api";
import { Shell, PageHeader } from "@/components/ui/TopBar";
import { Card, Stat, Button, Skeleton } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import {
  IconUsers,
  IconCalendar,
  IconTicket,
  IconCash,
  IconTrend,
  IconChevron,
  IconQr,
  IconAlert,
} from "@/components/ui/Icons";

export default function AdminHome() {
  const { ready } = useAuth("admin");
  const toast = useToast();
  const [students, setStudents] = useState<StudentRow[] | null>(null);
  const [classes, setClasses] = useState<ClassRow[] | null>(null);
  const [debtors, setDebtors] = useState<Debtor[] | null>(null);
  const [today, setToday] = useState<SessionToday[] | null>(null);
  const [risk, setRisk] = useState<StudentRisk[]>([]);
  const [oldPending, setOldPending] = useState<OldPending[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ready) return;
    listStudents().then(setStudents).catch(() => setStudents([]));
    listClasses().then(setClasses).catch(() => setClasses([]));
    listDebtors().then(setDebtors).catch(() => setDebtors([]));
    getTodaySessions().then(setToday).catch(() => setToday([]));
    getAdminAlerts()
      .then((a) => { setRisk(a.studentsAtRisk); setOldPending(a.oldPending); })
      .catch(() => {});
  }, [ready]);

  if (!ready) return null;

  const pendingToday = today?.reduce((a, s) => a + s.pendingCount, 0) ?? 0;
  const totalDebt = debtors?.reduce((a, d) => a + d.debtClasses, 0) ?? 0;

  const loadHorarios = async () => {
    setBusy(true);
    try {
      const r = await seedHorarios();
      toast.success(r.message);
      listClasses().then(setClasses);
    } catch {
      toast.error("No se pudieron cargar los horarios.");
    } finally {
      setBusy(false);
    }
  };

  const generateToday = async () => {
    setBusy(true);
    try {
      const { count } = await ensureTodaySessions();
      toast.success(count > 0 ? `${count} clase(s) de hoy disponibles.` : "Hoy no hay clases en la grilla.");
      getTodaySessions().then(setToday);
    } catch {
      toast.error("No se pudieron generar las clases de hoy.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <PageHeader
        eyebrow="Administración"
        title="Panel general"
        subtitle="Resumen de la academia y accesos rápidos a la gestión."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={generateToday} loading={busy} icon={<IconCalendar />}>
              Generar clases de hoy
            </Button>
            <Button variant="ghost" onClick={loadHorarios} loading={busy} icon={<IconCalendar />}>
              Cargar horarios 2026
            </Button>
          </div>
        }
      />

      {/* Métricas */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {students === null ? (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)
        ) : (
          <>
            <Stat label="Alumnos" value={students.length} icon={<IconUsers />} />
            <Stat label="Clases" value={classes?.length ?? 0} icon={<IconCalendar />} />
            <Stat label="Pendientes hoy" value={pendingToday} tone={pendingToday > 0 ? "amber" : "default"} icon={<IconAlert />} />
            <Stat label="Deuda (clases)" value={totalDebt} tone={totalDebt > 0 ? "red" : "default"} icon={<IconTrend />} />
          </>
        )}
      </div>

      {/* Accesos */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <NavCard href="/admin/students" icon={<IconUsers />} title="Alumnos" desc="Alta, listado y ficha de cada alumno." />
        <NavCard href="/admin/teachers" icon={<IconUsers />} title="Profesores" desc="Alta, edición y baja de profesores." />
        <NavCard href="/admin/classes" icon={<IconCalendar />} title="Clases" desc="Grilla de clases y horarios." />
        <NavCard href="/admin/passes" icon={<IconTicket />} title="Cuponeras" desc="Vender packs y pases; extender vigencias." />
        <NavCard href="/admin/payments" icon={<IconCash />} title="Pagos" desc="Registrar pagos manuales y ver morosos." />
        <NavCard href="/checkin" icon={<IconQr />} title="Check-in" desc="Recepción: escanear QR de alumnos." />
        <NavCard href="/display" icon={<IconQr />} title="Pantalla QR" desc="QR dinámico por clase para que el alumno escanee." />
        <NavCard href="/teacher" icon={<IconCalendar />} title="Asistencias" desc="Confirmar la lista de cada clase." />
      </div>

      {/* Recordatorios / avisos */}
      {(risk.length > 0 || oldPending.length > 0) && (
        <Card className="mt-6 p-5">
          <h2 className="mb-3 flex items-center gap-2 font-semibold">
            <span className="text-amber-300"><IconAlert /></span> Recordatorios
          </h2>

          {oldPending.length > 0 && (
            <Link
              href="/teacher"
              className="mb-3 flex items-center justify-between rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200 transition hover:bg-red-500/15"
            >
              <span>{oldPending.length} asistencia(s) pendiente(s) de clases ya finalizadas</span>
              <IconChevron />
            </Link>
          )}

          <div className="divide-y divide-ink-500/50">
            {risk.slice(0, 8).map((r, i) => (
              <Link
                key={r.studentId + i}
                href={`/admin/students/${r.studentId}`}
                className="flex items-center justify-between gap-2 py-2.5 transition hover:text-lime"
              >
                <span className="min-w-0 truncate text-sm font-medium">{r.fullName}</span>
                <span className={r.level === "critical" ? "chip-red" : "chip-amber"}>{r.message}</span>
              </Link>
            ))}
          </div>
          {risk.length > 8 && (
            <p className="mt-2 text-xs text-muted-dim">y {risk.length - 8} aviso(s) más…</p>
          )}
        </Card>
      )}

      {/* Morosos destacados */}
      {debtors && debtors.length > 0 && (
        <Card className="mt-6 p-5">
          <h2 className="mb-3 flex items-center gap-2 font-semibold">
            <span className="text-red-400"><IconAlert /></span> Alumnos con deuda
          </h2>
          <div className="divide-y divide-ink-500/50">
            {debtors.slice(0, 5).map((d) => (
              <Link
                key={d.studentId}
                href={`/admin/students/${d.studentId}`}
                className="flex items-center justify-between py-2.5 transition hover:text-lime"
              >
                <span className="text-sm font-medium">{d.fullName}</span>
                <span className="chip-red">Debe {d.debtClasses}</span>
              </Link>
            ))}
          </div>
          {debtors.length > 5 && (
            <Link href="/admin/payments" className="mt-3 inline-block text-sm text-muted hover:text-lime">
              Ver todos ({debtors.length}) →
            </Link>
          )}
        </Card>
      )}
    </Shell>
  );
}

function NavCard({ href, icon, title, desc }: { href: string; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <Link href={href}>
      <Card hover className="group flex items-center gap-4 p-5">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-lime/15 text-xl text-lime">
          {icon}
        </span>
        <div className="flex-1">
          <p className="font-semibold">{title}</p>
          <p className="mt-0.5 text-sm text-muted">{desc}</p>
        </div>
        <span className="text-muted-dim transition group-hover:translate-x-1 group-hover:text-lime">
          <IconChevron />
        </span>
      </Card>
    </Link>
  );
}
