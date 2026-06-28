"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/useAuth";
import { getMyPanel, StudentPanel, ApiError } from "@/lib/api";
import StudentCard from "@/components/StudentCard";

const STATUS_ES: Record<string, string> = {
  Pending: "Pendiente", Confirmed: "Confirmada", Rejected: "Rechazada", Corrected: "Corregida",
};

export default function MyPanel() {
  const { ready } = useAuth("student");
  const [panel, setPanel] = useState<StudentPanel | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    getMyPanel()
      .then(setPanel)
      .catch((e) => setError(e instanceof ApiError ? e.message : "No se pudo cargar."));
  }, [ready]);

  if (!ready) return null;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 p-6">
      <div className="max-w-2xl mx-auto">
        <a href="/" className="text-sm text-slate-500">&larr; Inicio</a>
        <h1 className="text-2xl font-bold mt-2 mb-4">Mi panel</h1>

        {error && <p className="text-red-600">{error}</p>}
        {!panel && !error && <p className="text-slate-400">Cargando…</p>}

        {panel && (
          <div className="space-y-4">
            <section className="bg-white rounded-xl shadow p-4">
              <StudentCard student={panel.summary} />
              <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                <Stat label="Clases restantes" value={panel.summary.classesRemaining} />
                <Stat label="Pendientes" value={panel.summary.pendingAttendances} />
                <Stat label="Deuda" value={panel.summary.debtClasses} highlight={panel.summary.debtClasses > 0} />
              </div>
            </section>

            <Section title="Cuponeras">
              {panel.passes.length === 0 && <Empty />}
              {panel.passes.map((p) => (
                <Row key={p.id}
                  left={`${p.kind} · ${p.status}`}
                  right={`${p.kind === "UnlimitedMonth" ? "libre" : `${p.balance} clase(s)`} · vence ${p.validTo}`}
                />
              ))}
            </Section>

            <Section title="Historial de asistencias">
              {panel.history.length === 0 && <Empty />}
              {panel.history.map((h) => (
                <Row key={h.id} left={`${h.date} · ${h.className}`} right={STATUS_ES[h.status] ?? h.status} />
              ))}
            </Section>

            <Section title="Pagos">
              {panel.payments.length === 0 && <Empty />}
              {panel.payments.map((p) => (
                <Row key={p.id} left={`${p.concept ?? p.method} · ${p.status}`} right={`$${p.amount}`} />
              ))}
            </Section>
          </div>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className={`text-2xl font-bold ${highlight ? "text-red-600" : ""}`}>{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl shadow p-4">
      <h2 className="font-semibold mb-2">{title}</h2>
      <div className="divide-y">{children}</div>
    </section>
  );
}
function Row({ left, right }: { left: string; right: string }) {
  return (
    <div className="py-2 flex justify-between text-sm">
      <span>{left}</span>
      <span className="text-slate-500">{right}</span>
    </div>
  );
}
function Empty() {
  return <p className="text-slate-400 text-sm py-2">Sin datos.</p>;
}
