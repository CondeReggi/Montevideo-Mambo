"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/useAuth";
import {
  getStudentDetail,
  listStudents,
  listPassTypes,
  assignPass,
  payPass,
  registerPayment,
  extendPass,
  manualAttendance,
  updateStudent,
  setStudentActive,
  StudentPanel,
  StudentRow,
  PassType,
  ApiError,
} from "@/lib/api";
import { Shell } from "@/components/ui/TopBar";
import { Card, Stat, Button, Field, Avatar, Badge, Skeleton } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { useDialog } from "@/components/ui/Dialog";
import { PassBadge, StatusBadge, fmtDate, kindLabel } from "@/components/format";
import { IconArrowLeft, IconTicket, IconCash, IconCalendar, IconPlus, IconCheck, IconQr } from "@/components/ui/Icons";
import StudentQr from "@/components/StudentQr";
import AlertsBanner, { criticalPassIds } from "@/components/AlertsBanner";

export default function StudentDetailPage() {
  const { ready } = useAuth("admin");
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const dialog = useDialog();
  const [panel, setPanel] = useState<StudentPanel | null>(null);
  const [row, setRow] = useState<StudentRow | null>(null);
  const [passTypes, setPassTypes] = useState<PassType[]>([]);
  const [busy, setBusy] = useState(false);

  // Formularios
  const [passTypeId, setPassTypeId] = useState("");
  const [payWithPass, setPayWithPass] = useState(true);
  const [payAmount, setPayAmount] = useState("");
  const [payConcept, setPayConcept] = useState("");

  // Edición
  const [editing, setEditing] = useState(false);
  const [edName, setEdName] = useState("");
  const [edPhone, setEdPhone] = useState("");
  const [edDoc, setEdDoc] = useState("");

  const load = useCallback(async () => {
    try {
      const [p, rows] = await Promise.all([getStudentDetail(id), listStudents()]);
      setPanel(p);
      setRow(rows.find((r) => r.id === id) ?? null);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo cargar el alumno.");
    }
  }, [id, toast]);

  useEffect(() => {
    if (!ready) return;
    load();
    listPassTypes().then((t) => {
      setPassTypes(t);
      if (t[0]) setPassTypeId(t[0].id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, id]);

  const openEdit = () => {
    setEdName(panel?.summary.fullName ?? "");
    setEdPhone(row?.phone ?? "");
    setEdDoc("");
    setEditing(true);
  };
  const doSaveEdit = () =>
    run(
      () => updateStudent(id, { fullName: edName, phone: edPhone || undefined, documentId: edDoc || undefined }),
      "Datos actualizados.",
    ).then(() => setEditing(false));
  const doToggleActive = async () => {
    if (!row) return;
    const next = !row.isActive;
    if (!next) {
      const ok = await dialog.confirm({
        title: `Dar de baja a ${panel?.summary.fullName ?? "este alumno"}`,
        message: "El alumno deja de estar activo y no podrá ingresar. Podés reactivarlo cuando quieras; no se borra su historial.",
        confirmLabel: "Dar de baja",
        tone: "danger",
      });
      if (!ok) return;
    }
    return run(() => setStudentActive(id, next), next ? "Alumno reactivado." : "Alumno dado de baja.");
  };

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Error al procesar.");
    } finally {
      setBusy(false);
    }
  };

  const doAssign = () =>
    run(() => assignPass({ studentId: id, passTypeId, registerPayment: payWithPass }), "Cuponera asignada.");
  const doPay = () =>
    run(
      () =>
        registerPayment({
          studentId: id,
          amount: Number(payAmount),
          method: "efectivo",
          concept: payConcept || undefined,
          confirmed: true,
        }),
      "Pago registrado.",
    ).then(() => {
      setPayAmount("");
      setPayConcept("");
    });
  const doExtend = async (passId: string) => {
    const res = await dialog.prompt({
      title: "Extender cuponera",
      message: "Agregá días de vigencia y/o clases. Queda registrado como un movimiento del ledger.",
      fields: [
        { name: "days", label: "Días de vigencia a agregar", type: "number", defaultValue: "30" },
        { name: "classes", label: "Clases a agregar", type: "number", defaultValue: "0" },
      ],
      confirmLabel: "Extender",
    });
    if (res === null) return;
    const days = Number(res.days) || 0;
    const classes = Number(res.classes) || 0;
    if (!days && !classes) {
      toast.info("No se ingresaron días ni clases.");
      return;
    }
    return run(() => extendPass(passId, { extraDays: days, extraClasses: classes }), "Cuponera extendida.");
  };
  const doManual = () => run(() => manualAttendance(id), "Asistencia manual registrada.");
  const doPayPass = (passId: string) => run(() => payPass(passId), "Cuponera cobrada.");

  if (!ready) return null;

  const selectedType = passTypes.find((t) => t.id === passTypeId);
  const critical = panel ? criticalPassIds(panel.alerts) : new Set<string>();

  return (
    <Shell>
      <Link
        href="/admin/students"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted transition hover:text-foreground"
      >
        <IconArrowLeft /> Alumnos
      </Link>

      {!panel ? (
        <div className="grid grid-cols-1 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-40" />
        </div>
      ) : (
        <>
          <Card className="mb-5 flex flex-wrap items-center gap-4 p-5">
            <Avatar name={panel.summary.fullName} photoUrl={panel.summary.photoUrl} size="lg" ring />
            <div className="min-w-0 flex-1">
              <h1 className="break-words font-display text-2xl tracking-wide">{panel.summary.fullName}</h1>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {row && !row.isActive && <Badge tone="red">Dado de baja</Badge>}
                {panel.summary.hasActiveUnlimited && <Badge tone="lime">Pase libre</Badge>}
                {panel.summary.debtClasses > 0 && <Badge tone="red">Debe {panel.summary.debtClasses}</Badge>}
                {panel.summary.pendingAttendances > 0 && (
                  <Badge tone="amber">{panel.summary.pendingAttendances} pendiente(s)</Badge>
                )}
                {row?.phone && <span className="text-xs text-muted">{row.phone}</span>}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" className="btn-sm" onClick={openEdit} disabled={busy}>
                Editar
              </Button>
              <Button
                variant={row?.isActive ? "danger" : "primary"}
                className="btn-sm"
                onClick={doToggleActive}
                loading={busy}
              >
                {row?.isActive ? "Dar de baja" : "Reactivar"}
              </Button>
              <Button variant="ghost" className="btn-sm" onClick={doManual} loading={busy} icon={<IconCheck />}>
                Asistencia manual
              </Button>
            </div>
          </Card>

          {editing && (
            <Card className="mb-5 p-5 animate-fade-up">
              <h2 className="mb-4 font-semibold">Editar datos del alumno</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label="Nombre completo" value={edName} onChange={setEdName} />
                <Field label="Teléfono" value={edPhone} onChange={setEdPhone} placeholder="092 …" />
                <Field label="Documento" value={edDoc} onChange={setEdDoc} placeholder="Opcional" />
              </div>
              <div className="mt-4 flex gap-2">
                <Button onClick={doSaveEdit} loading={busy} disabled={!edName.trim()}>
                  Guardar
                </Button>
                <Button variant="ghost" onClick={() => setEditing(false)} disabled={busy}>
                  Cancelar
                </Button>
              </div>
            </Card>
          )}

          <div className="mb-5">
            <AlertsBanner alerts={panel.alerts} />
          </div>

          <div className="mb-5 grid grid-cols-3 gap-3">
            <Stat label="Clases restantes" value={panel.summary.hasActiveUnlimited ? "∞" : panel.summary.classesRemaining} tone="lime" />
            <Stat label="Pendientes" value={panel.summary.pendingAttendances} tone="amber" />
            <Stat label="Deuda" value={panel.summary.debtClasses} tone={panel.summary.debtClasses > 0 ? "red" : "default"} />
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* Vender cuponera */}
            <Card className="p-5">
              <h2 className="mb-4 flex items-center gap-2 font-semibold">
                <span className="text-lime"><IconTicket /></span> Vender cuponera
              </h2>
              <label className="label">Tipo de cuponera</label>
              <select value={passTypeId} onChange={(e) => setPassTypeId(e.target.value)} className="field mb-3">
                {passTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} — ${t.price}
                    {t.classCount ? ` · ${t.classCount} clases` : ""}
                  </option>
                ))}
              </select>
              <label className="mb-2 flex items-start gap-2 text-sm text-muted-soft">
                <input
                  type="checkbox"
                  checked={payWithPass}
                  onChange={(e) => setPayWithPass(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-lime"
                />
                <span>
                  Cobrar la cuponera ahora (${selectedType?.price ?? 0}).{" "}
                  <span className="text-muted-dim">
                    Si lo dejás sin tildar, se entrega <b className="text-amber-300">impaga</b> y queda como deuda del alumno (después la cobrás con “Cobrar”).
                  </span>
                </span>
              </label>
              <Button onClick={doAssign} loading={busy} disabled={!passTypeId} icon={<IconPlus />}>
                Asignar cuponera
              </Button>
            </Card>

            {/* Registrar pago */}
            <Card className="p-5">
              <h2 className="mb-4 flex items-center gap-2 font-semibold">
                <span className="text-lime"><IconCash /></span> Registrar pago
              </h2>
              <div className="grid grid-cols-1 gap-3">
                <Field label="Monto ($)" value={payAmount} onChange={setPayAmount} type="number" placeholder="0" />
                <Field label="Concepto (opcional)" value={payConcept} onChange={setPayConcept} placeholder="Ej. seña, mensualidad…" />
              </div>
              <div className="mt-4">
                <Button onClick={doPay} loading={busy} disabled={!payAmount || Number(payAmount) <= 0} icon={<IconCash />}>
                  Registrar pago
                </Button>
              </div>
            </Card>
          </div>

          {/* Cuponeras */}
          <Card className="mt-5 p-5">
            <h2 className="mb-2 flex items-center gap-2 font-semibold">
              <span className="text-lime"><IconTicket /></span> Cuponeras
            </h2>
            <div className="divide-y divide-ink-500/50">
              {panel.passes.length === 0 && <p className="py-3 text-sm text-muted-dim">Sin cuponeras.</p>}
              {panel.passes.map((p) => {
                const isCrit = critical.has(p.id);
                return (
                  <div
                    key={p.id}
                    className={`flex items-center gap-3 py-3 ${
                      isCrit ? "-mx-2 rounded-lg border-l-2 border-red-500/70 bg-red-500/5 px-2" : ""
                    }`}
                  >
                    <PassBadge kind={p.kind} />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-sm font-medium">
                        {kindLabel(p.kind)}
                        {!p.isPaid && <Badge tone="amber">Impaga ${p.price}</Badge>}
                      </p>
                      <p className={`text-xs ${isCrit ? "text-red-300" : "text-muted"}`}>
                        Vence {fmtDate(p.validTo)} · <StatusBadge status={p.status} />
                      </p>
                    </div>
                    <p className={`font-display text-xl ${isCrit ? "text-red-400" : "text-lime"}`}>
                      {p.kind === "UnlimitedMonth" ? "Libre" : p.balance}
                    </p>
                    {!p.isPaid && (
                      <Button className="btn-sm" onClick={() => doPayPass(p.id)} loading={busy} icon={<IconCash />}>
                        Cobrar
                      </Button>
                    )}
                    <Button variant="ghost" className="btn-sm" onClick={() => doExtend(p.id)} disabled={busy}>
                      Extender
                    </Button>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Carnet / QR del alumno */}
          {row && (
            <Card className="mt-5 p-5">
              <h2 className="mb-4 flex items-center gap-2 font-semibold">
                <span className="text-lime"><IconQr /></span> Carnet QR del alumno
              </h2>
              <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-sm text-sm text-muted">
                  Este es el código fijo del alumno. La recepción lo escanea en el check-in para
                  registrar la asistencia. Imprimí el carnet para entregárselo.
                </p>
                <StudentQr code={row.qrFixedCode} name={panel.summary.fullName} />
              </div>
            </Card>
          )}

          {/* Historial y pagos */}
          <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card className="p-5">
              <h2 className="mb-2 flex items-center gap-2 font-semibold">
                <span className="text-lime"><IconCalendar /></span> Historial
              </h2>
              <div className="divide-y divide-ink-500/50">
                {panel.history.length === 0 && <p className="py-3 text-sm text-muted-dim">Sin asistencias.</p>}
                {panel.history.slice(0, 12).map((h) => (
                  <div key={h.id} className="flex items-center justify-between py-2.5">
                    <div>
                      <p className="text-sm font-medium">{h.className}</p>
                      <p className="text-xs text-muted">{fmtDate(h.date)}</p>
                    </div>
                    <StatusBadge status={h.status} />
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-5">
              <h2 className="mb-2 flex items-center gap-2 font-semibold">
                <span className="text-lime"><IconCash /></span> Pagos
              </h2>
              <div className="divide-y divide-ink-500/50">
                {panel.payments.length === 0 && <p className="py-3 text-sm text-muted-dim">Sin pagos.</p>}
                {panel.payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-2.5">
                    <div>
                      <p className="text-sm font-medium">{p.concept ?? p.method}</p>
                      <p className="text-xs text-muted">{p.paidAt ? fmtDate(p.paidAt) : "sin fecha"}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">${p.amount}</p>
                      <StatusBadge status={p.status} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}
    </Shell>
  );
}
