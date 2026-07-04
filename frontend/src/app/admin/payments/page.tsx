"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/useAuth";
import {
  listStudents, listDebtors, registerPayment,
  listPendingPayments, confirmPayment, cancelPayment,
  StudentRow, Debtor, PendingPayment, ApiError,
} from "@/lib/api";
import { Shell, PageHeader } from "@/components/ui/TopBar";
import { Card, Button, Field, Badge, Skeleton, EmptyState, Avatar } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { IconCash, IconAlert, IconChevron, IconClock, IconCheck, IconX, IconSpark } from "@/components/ui/Icons";
import { fmtDate } from "@/components/format";

const METHODS = ["efectivo", "transferencia", "débito", "crédito"];

export default function AdminPayments() {
  const { ready } = useAuth("admin");
  const toast = useToast();
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [debtors, setDebtors] = useState<Debtor[] | null>(null);
  const [pending, setPending] = useState<PendingPayment[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ studentId: "", amount: "", method: "efectivo", concept: "", confirmed: true });

  const loadDebtors = useCallback(async () => {
    try {
      setDebtors(await listDebtors());
    } catch {
      setDebtors([]);
    }
  }, []);
  const loadPending = useCallback(async () => {
    try {
      setPending(await listPendingPayments());
    } catch {
      setPending([]);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    listStudents().then(setStudents).catch(() => setStudents([]));
    loadDebtors();
    loadPending();
  }, [ready, loadDebtors, loadPending]);

  const submit = async () => {
    setBusy(true);
    try {
      await registerPayment({
        studentId: form.studentId,
        amount: Number(form.amount),
        method: form.method,
        concept: form.concept || undefined,
        confirmed: form.confirmed,
      });
      toast.success(form.confirmed ? "Pago registrado." : "Pago pendiente registrado.");
      setForm({ ...form, amount: "", concept: "" });
      loadDebtors();
      loadPending();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo registrar.");
    } finally {
      setBusy(false);
    }
  };

  const runPending = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      await Promise.all([loadPending(), loadDebtors()]);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo procesar.");
    } finally {
      setBusy(false);
    }
  };

  if (!ready) return null;

  return (
    <Shell>
      <PageHeader eyebrow="Administración" title="Pagos" subtitle="Registrá pagos manuales y controlá la morosidad." />

      {/* Aviso: integración futura con Mercado Pago */}
      <div className="mb-5 flex items-start gap-3 rounded-xl border border-sky-400/40 bg-sky-400/10 px-4 py-3 text-sm text-sky-200 animate-fade-up">
        <span className="mt-0.5 text-lg text-sky-300"><IconSpark /></span>
        <div>
          <p className="font-semibold text-sky-100">Próximamente: Mercado Pago</p>
          <p className="text-sky-200/80">
            Vas a poder cobrar con link de pago / QR de Mercado Pago desde acá; por ahora los pagos se registran manualmente.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Registrar pago */}
        <Card className="p-5">
          <h2 className="mb-4 flex items-center gap-2 font-semibold">
            <span className="text-lime"><IconCash /></span> Registrar pago
          </h2>
          <div className="grid grid-cols-1 gap-3">
            <label className="block">
              <span className="label">Alumno</span>
              <select
                value={form.studentId}
                onChange={(e) => setForm({ ...form, studentId: e.target.value })}
                className="field"
              >
                <option value="">Elegí un alumno…</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.fullName}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Monto ($)" value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} type="number" placeholder="0" />
              <label className="block">
                <span className="label">Método</span>
                <select
                  value={form.method}
                  onChange={(e) => setForm({ ...form, method: e.target.value })}
                  className="field"
                >
                  {METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <Field label="Concepto (opcional)" value={form.concept} onChange={(v) => setForm({ ...form, concept: v })} placeholder="Ej. mensualidad, seña…" />
            <label className="flex items-center gap-2 text-sm text-muted-soft">
              <input
                type="checkbox"
                checked={form.confirmed}
                onChange={(e) => setForm({ ...form, confirmed: e.target.checked })}
                className="h-4 w-4 accent-lime"
              />
              Registrar como confirmado (desmarcá para dejarlo pendiente)
            </label>
          </div>
          <div className="mt-4">
            <Button
              onClick={submit}
              loading={busy}
              disabled={!form.studentId || !form.amount || Number(form.amount) <= 0}
              icon={<IconCash />}
            >
              {form.confirmed ? "Registrar pago" : "Registrar pendiente"}
            </Button>
          </div>
        </Card>

        {/* Morosos */}
        <Card className="p-5">
          <h2 className="mb-4 flex items-center gap-2 font-semibold">
            <span className="text-red-400"><IconAlert /></span> Alumnos con deuda
          </h2>
          {debtors === null && (
            <div className="grid grid-cols-1 gap-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          )}
          {debtors !== null && debtors.length === 0 && (
            <EmptyState icon={<IconCash />} title="Sin deudas" hint="Ningún alumno tiene deuda pendiente." />
          )}
          <div className="divide-y divide-ink-500/50">
            {debtors?.map((d) => (
              <Link
                key={d.studentId}
                href={`/admin/students/${d.studentId}`}
                className="flex items-center gap-3 py-3 transition hover:text-lime"
              >
                <Avatar name={d.fullName} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{d.fullName}</p>
                  <p className="text-xs text-muted">
                    {d.classesRemaining} disponible(s) · {d.pendingAttendances} pendiente(s)
                  </p>
                </div>
                <Badge tone="red">Debe {d.debtClasses}</Badge>
                <span className="text-muted-dim">
                  <IconChevron />
                </span>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      {/* Pagos pendientes de confirmar */}
      <Card className="mt-5 p-5">
        <h2 className="mb-4 flex items-center gap-2 font-semibold">
          <span className="text-amber-300"><IconClock /></span> Pagos pendientes de confirmar
          {pending && pending.length > 0 && <Badge tone="amber">{pending.length}</Badge>}
        </h2>
        {pending === null && (
          <div className="grid grid-cols-1 gap-2">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        )}
        {pending !== null && pending.length === 0 && (
          <EmptyState icon={<IconCheck />} title="Sin pagos pendientes" hint="Todos los pagos están confirmados o cancelados." />
        )}
        <div className="divide-y divide-ink-500/50">
          {pending?.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-3 py-3">
              <Avatar name={p.fullName} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p.fullName}</p>
                <p className="text-xs text-muted">
                  {p.concept ?? p.method} · {fmtDate(p.createdAt)}
                </p>
              </div>
              <p className="font-display text-lg text-lime">${p.amount}</p>
              <div className="flex gap-1.5">
                <Button
                  className="btn-sm"
                  onClick={() => runPending(() => confirmPayment(p.id), "Pago confirmado.")}
                  disabled={busy}
                  icon={<IconCheck />}
                >
                  Confirmar
                </Button>
                <Button
                  variant="danger"
                  className="btn-sm"
                  onClick={() => runPending(() => cancelPayment(p.id), "Pago cancelado.")}
                  disabled={busy}
                  icon={<IconX />}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </Shell>
  );
}
