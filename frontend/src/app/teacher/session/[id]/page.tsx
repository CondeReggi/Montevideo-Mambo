"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  getSessionAttendances,
  SessionAttendance,
  confirmAttendance,
  confirmMany,
  correctAttendance,
  rejectAttendance,
  ApiError,
} from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { Shell, PageHeader } from "@/components/ui/TopBar";
import { Button, Card, Skeleton, EmptyState } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { useDialog } from "@/components/ui/Dialog";
import { useRegisterRefresh } from "@/components/Refresh";
import StudentCard from "@/components/StudentCard";
import { IconArrowLeft, IconCheck, IconX, IconAlert, IconUsers } from "@/components/ui/Icons";

export default function SessionDetail() {
  const { ready } = useAuth(["admin", "teacher"]);
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const dialog = useDialog();
  const [items, setItems] = useState<SessionAttendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await getSessionAttendances(id, true));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo cargar.");
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    if (ready) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, id]);
  useRegisterRefresh(load);

  const run = async (fn: () => Promise<unknown>, okMsg: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(okMsg);
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Error al procesar.");
    } finally {
      setBusy(false);
    }
  };

  const confirmAll = () => run(() => confirmMany(items.map((i) => i.id)), "Asistencias confirmadas.");
  const correct = async (attId: string) => {
    const res = await dialog.prompt({
      title: "Corregir asistencia",
      message: "Podés dejar un motivo para la auditoría (opcional).",
      fields: [{ name: "reason", label: "Motivo", type: "textarea", placeholder: "Ej. se registró en la clase equivocada…" }],
      confirmLabel: "Corregir",
    });
    if (res === null) return;
    return run(() => correctAttendance(attId, res.reason || undefined), "Asistencia corregida.");
  };
  const reject = async (attId: string) => {
    const res = await dialog.prompt({
      title: "Rechazar asistencia",
      message: "Podés dejar un motivo para la auditoría (opcional).",
      fields: [{ name: "reason", label: "Motivo", type: "textarea", placeholder: "Ej. el alumno no asistió…" }],
      confirmLabel: "Rechazar",
    });
    if (res === null) return;
    return run(() => rejectAttendance(attId, res.reason || undefined), "Asistencia rechazada.");
  };

  if (!ready) return null;

  return (
    <Shell max="max-w-3xl">
      <Link
        href="/teacher"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted transition hover:text-foreground"
      >
        <IconArrowLeft /> Clases de hoy
      </Link>
      <PageHeader
        eyebrow="Confirmación de asistencias"
        title="Pendientes de la clase"
        actions={
          items.length > 0 && (
            <Button onClick={confirmAll} loading={busy} icon={<IconCheck />}>
              Confirmar toda la lista
            </Button>
          )
        }
      />

      {loading && (
        <div className="grid grid-cols-1 gap-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      )}
      {!loading && items.length === 0 && (
        <EmptyState icon={<IconUsers />} title="No hay asistencias pendientes" hint="Todas las asistencias de esta clase ya fueron procesadas." />
      )}

      <div className="grid grid-cols-1 gap-3">
        {items.map((a) => (
          <Card key={a.id} className="p-4 animate-fade-up">
            <StudentCard student={a.student} />
            {(a.isAmbiguous || a.source === "OutOfWindowManual") && (
              <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-amber-400/10 px-3 py-2 text-xs text-amber-300">
                <IconAlert />
                {a.source === "OutOfWindowManual" ? "Registrado fuera de ventana" : "Detección ambigua"} — revisar antes de confirmar.
              </div>
            )}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button
                className="col-span-2"
                onClick={() => run(() => confirmAttendance(a.id), "Asistencia confirmada.")}
                disabled={busy}
                icon={<IconCheck />}
              >
                Confirmar
              </Button>
              <Button variant="ghost" onClick={() => correct(a.id)} disabled={busy}>
                Corregir
              </Button>
              <Button variant="danger" onClick={() => reject(a.id)} disabled={busy} icon={<IconX />}>
                Rechazar
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </Shell>
  );
}
