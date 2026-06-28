"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getTodaySessions, SessionToday, ApiError } from "@/lib/api";

export default function TeacherHome() {
  const [sessions, setSessions] = useState<SessionToday[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTodaySessions()
      .then(setSessions)
      .catch((e) => setError(e instanceof ApiError ? e.message : "No se pudo cargar."))
      .finally(() => setLoading(false));
  }, []);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" });

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-1">Clases de hoy</h1>
        <p className="text-sm text-slate-500 mb-6">Elegí una clase para confirmar asistencias.</p>

        {loading && <p className="text-slate-400">Cargando…</p>}
        {error && <p className="text-red-600">{error}</p>}
        {!loading && !error && sessions.length === 0 && (
          <p className="text-slate-400">No hay clases programadas para hoy.</p>
        )}

        <div className="grid gap-3">
          {sessions.map((s) => (
            <Link
              key={s.id}
              href={`/teacher/session/${s.id}`}
              className="bg-white rounded-xl shadow p-4 flex items-center justify-between hover:shadow-md transition"
            >
              <div>
                <p className="font-semibold">{s.className}</p>
                <p className="text-sm text-slate-500">
                  {s.style} · {s.level} · {fmt(s.startAt)}–{fmt(s.endAt)}
                  {s.status !== "scheduled" && ` · ${s.status}`}
                </p>
              </div>
              <div className="text-right text-sm">
                {s.pendingCount > 0 ? (
                  <span className="inline-block rounded-full bg-amber-100 text-amber-800 px-3 py-1 font-medium">
                    {s.pendingCount} pendiente(s)
                  </span>
                ) : (
                  <span className="text-slate-400">sin pendientes</span>
                )}
                <p className="text-slate-400 mt-1">{s.confirmedCount} confirmada(s)</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
