"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  getSessionAttendances,
  SessionAttendance,
  confirmAttendance,
  confirmMany,
  correctAttendance,
  ApiError,
} from "@/lib/api";
import StudentCard from "@/components/StudentCard";

export default function SessionDetail() {
  const { id } = useParams<{ id: string }>();
  const [items, setItems] = useState<SessionAttendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await getSessionAttendances(id, true));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cargar.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Error al procesar.");
    } finally {
      setBusy(false);
    }
  };

  const confirmAll = () => run(() => confirmMany(items.map((i) => i.id)));

  const correct = (attId: string) => {
    const reason = window.prompt("Motivo de la corrección (opcional):") ?? undefined;
    return run(() => correctAttendance(attId, reason));
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 p-6">
      <div className="max-w-2xl mx-auto">
        <a href="/teacher" className="text-sm text-slate-500">&larr; Clases de hoy</a>
        <div className="flex items-center justify-between mt-2 mb-4">
          <h1 className="text-2xl font-bold">Pendientes de confirmar</h1>
          {items.length > 0 && (
            <button
              onClick={confirmAll}
              disabled={busy}
              className="rounded-lg bg-emerald-600 text-white px-4 py-2 font-medium disabled:opacity-50"
            >
              Confirmar toda la lista
            </button>
          )}
        </div>

        {loading && <p className="text-slate-400">Cargando…</p>}
        {error && <p className="text-red-600 mb-3">{error}</p>}
        {!loading && items.length === 0 && (
          <p className="text-slate-400">No hay asistencias pendientes en esta clase.</p>
        )}

        <div className="grid gap-3">
          {items.map((a) => (
            <div key={a.id} className="bg-white rounded-xl shadow p-4">
              <StudentCard student={a.student} />
              {(a.isAmbiguous || a.source === "OutOfWindowManual") && (
                <p className="text-xs text-amber-700 mt-2">
                  {a.source === "OutOfWindowManual" ? "Registrado fuera de ventana" : "Detección ambigua"} — revisar.
                </p>
              )}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => run(() => confirmAttendance(a.id))}
                  disabled={busy}
                  className="flex-1 rounded-lg bg-emerald-600 text-white py-2 font-medium disabled:opacity-50"
                >
                  Confirmar
                </button>
                <button
                  onClick={() => correct(a.id)}
                  disabled={busy}
                  className="rounded-lg border border-slate-300 px-4 py-2 disabled:opacity-50"
                >
                  Corregir
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
