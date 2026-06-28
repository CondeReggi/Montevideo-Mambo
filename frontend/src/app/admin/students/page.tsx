"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/useAuth";
import { listStudents, createStudent, StudentRow, ApiError } from "@/lib/api";

export default function AdminStudents() {
  const { ready } = useAuth("admin");
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [form, setForm] = useState({ fullName: "", email: "", password: "", documentId: "", qrFixedCode: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setRows(await listStudents()); } catch { /* sesión/login */ }
  }, []);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      await createStudent({
        fullName: form.fullName, email: form.email, password: form.password,
        documentId: form.documentId || undefined, qrFixedCode: form.qrFixedCode || undefined,
      });
      setForm({ fullName: "", email: "", password: "", documentId: "", qrFixedCode: "" });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo crear.");
    } finally { setBusy(false); }
  };

  if (!ready) return null;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 p-6">
      <div className="max-w-2xl mx-auto">
        <a href="/admin" className="text-sm text-slate-500">&larr; Administración</a>
        <h1 className="text-2xl font-bold mt-2 mb-4">Alumnos</h1>

        <div className="bg-white rounded-xl shadow p-4 mb-6">
          <h2 className="font-semibold mb-3">Nuevo alumno</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <Input label="Nombre completo" value={form.fullName} onChange={(v) => setForm({ ...form, fullName: v })} />
            <Input label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
            <Input label="Contraseña" value={form.password} onChange={(v) => setForm({ ...form, password: v })} type="password" />
            <Input label="Documento (opcional)" value={form.documentId} onChange={(v) => setForm({ ...form, documentId: v })} />
            <Input label="Código QR fijo (opcional)" value={form.qrFixedCode} onChange={(v) => setForm({ ...form, qrFixedCode: v })} />
          </div>
          {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
          <button
            onClick={submit}
            disabled={busy || !form.fullName || !form.email || !form.password}
            className="mt-3 rounded-lg bg-emerald-600 text-white px-4 py-2 font-medium disabled:opacity-50"
          >
            Crear alumno
          </button>
        </div>

        <div className="bg-white rounded-xl shadow divide-y">
          {rows.length === 0 && <p className="p-4 text-slate-400">Sin alumnos aún.</p>}
          {rows.map((s) => (
            <div key={s.id} className="p-3 flex justify-between text-sm">
              <span className="font-medium">{s.fullName}</span>
              <span className="text-slate-500">{s.email} · QR {s.qrFixedCode}</span>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

function Input({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="text-sm">
      <span className="text-slate-600">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="w-full border rounded-lg px-3 py-2 mt-1" />
    </label>
  );
}
