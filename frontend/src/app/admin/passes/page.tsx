"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/useAuth";
import { listPassTypes, listStudents, assignPass, PassType, StudentRow, ApiError } from "@/lib/api";
import { Shell, PageHeader } from "@/components/ui/TopBar";
import { Card, Button, Skeleton } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { PassBadge, kindLabel } from "@/components/format";
import { IconTicket, IconPlus } from "@/components/ui/Icons";

export default function AdminPasses() {
  const { ready } = useAuth("admin");
  const toast = useToast();
  const [types, setTypes] = useState<PassType[] | null>(null);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [studentId, setStudentId] = useState("");
  const [passTypeId, setPassTypeId] = useState("");
  const [pay, setPay] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ready) return;
    listPassTypes().then((t) => {
      setTypes(t);
      if (t[0]) setPassTypeId(t[0].id);
    });
    listStudents().then(setStudents).catch(() => setStudents([]));
  }, [ready]);

  const assign = async () => {
    setBusy(true);
    try {
      await assignPass({ studentId, passTypeId, registerPayment: pay });
      const st = students.find((s) => s.id === studentId);
      toast.success(`Cuponera asignada a ${st?.fullName ?? "alumno"}.`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo asignar.");
    } finally {
      setBusy(false);
    }
  };

  if (!ready) return null;
  const selected = types?.find((t) => t.id === passTypeId);

  return (
    <Shell>
      <PageHeader
        eyebrow="Administración"
        title="Cuponeras"
        subtitle="Catálogo de packs y pases. Vendé una cuponera a un alumno con su crédito inicial."
      />

      {/* Asignación rápida */}
      <Card className="mb-6 p-5">
        <h2 className="mb-4 flex items-center gap-2 font-semibold">
          <span className="text-lime"><IconPlus /></span> Vender cuponera
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">Alumno</span>
            <select value={studentId} onChange={(e) => setStudentId(e.target.value)} className="field">
              <option value="">Elegí un alumno…</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">Cuponera</span>
            <select value={passTypeId} onChange={(e) => setPassTypeId(e.target.value)} className="field">
              {types?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} — ${t.price}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm text-muted-soft">
          <input type="checkbox" checked={pay} onChange={(e) => setPay(e.target.checked)} className="h-4 w-4 accent-lime" />
          Registrar el pago (${selected?.price ?? 0}) como confirmado
        </label>
        <div className="mt-4">
          <Button onClick={assign} loading={busy} disabled={!studentId || !passTypeId} icon={<IconTicket />}>
            Asignar cuponera
          </Button>
        </div>
      </Card>

      {/* Catálogo */}
      <h2 className="mb-3 eyebrow">Catálogo</h2>
      {types === null ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {types.map((t) => (
            <Card key={t.id} className="flex flex-col gap-3 p-5 animate-fade-up">
              <div className="flex items-center gap-3">
                <PassBadge kind={t.kind} />
                <div>
                  <p className="font-semibold">{t.name}</p>
                  <p className="text-xs text-muted">{kindLabel(t.kind)}</p>
                </div>
              </div>
              <div className="mt-auto flex items-end justify-between border-t border-ink-500/50 pt-3">
                <div>
                  <p className="font-display text-2xl text-lime">${t.price}</p>
                  <p className="text-xs text-muted">
                    {t.classCount ? `${t.classCount} clases` : "Sin límite"} · {t.validityDays} días
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </Shell>
  );
}
