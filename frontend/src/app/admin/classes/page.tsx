"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/useAuth";
import { listClasses, createClass, listTeachers, ClassRow, TeacherRow, ApiError } from "@/lib/api";

const WEEKDAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export default function AdminClasses() {
  const { ready } = useAuth("admin");
  const [rows, setRows] = useState<ClassRow[]>([]);
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [form, setForm] = useState({ name: "", style: "", level: "", weekday: 1, startTime: "20:00", endTime: "21:30", teacherIds: [] as string[] });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await listClasses());
      setTeachers(await listTeachers());
    } catch { /* sesión */ }
  }, []);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      await createClass({
        name: form.name, style: form.style, level: form.level, weekday: form.weekday,
        startTime: form.startTime, endTime: form.endTime, teacherIds: form.teacherIds,
      });
      setForm({ ...form, name: "", style: "", level: "" });
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
        <h1 className="text-2xl font-bold mt-2 mb-4">Clases</h1>

        <div className="bg-white rounded-xl shadow p-4 mb-6">
          <h2 className="font-semibold mb-3">Nueva clase</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <Input label="Nombre" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
            <Input label="Estilo" value={form.style} onChange={(v) => setForm({ ...form, style: v })} />
            <Input label="Nivel" value={form.level} onChange={(v) => setForm({ ...form, level: v })} />
            <label className="text-sm">
              <span className="text-slate-600">Día</span>
              <select value={form.weekday} onChange={(e) => setForm({ ...form, weekday: Number(e.target.value) })} className="w-full border rounded-lg px-3 py-2 mt-1">
                {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            </label>
            <Input label="Hora inicio" value={form.startTime} onChange={(v) => setForm({ ...form, startTime: v })} type="time" />
            <Input label="Hora fin" value={form.endTime} onChange={(v) => setForm({ ...form, endTime: v })} type="time" />
          </div>
          <label className="text-sm block mt-3">
            <span className="text-slate-600">Profesores</span>
            <select
              multiple
              value={form.teacherIds}
              onChange={(e) => setForm({ ...form, teacherIds: Array.from(e.target.selectedOptions).map((o) => o.value) })}
              className="w-full border rounded-lg px-3 py-2 mt-1 h-24"
            >
              {teachers.map((t) => <option key={t.id} value={t.id}>{t.fullName}</option>)}
            </select>
          </label>
          {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
          <button
            onClick={submit}
            disabled={busy || !form.name || !form.style || !form.level}
            className="mt-3 rounded-lg bg-emerald-600 text-white px-4 py-2 font-medium disabled:opacity-50"
          >
            Crear clase
          </button>
        </div>

        <div className="bg-white rounded-xl shadow divide-y">
          {rows.length === 0 && <p className="p-4 text-slate-400">Sin clases aún.</p>}
          {rows.map((c) => (
            <div key={c.id} className="p-3 text-sm">
              <p className="font-medium">{c.name} <span className="text-slate-400">({c.style} · {c.level})</span></p>
              <p className="text-slate-500">{WEEKDAYS[c.weekday]} {c.startTime}–{c.endTime} · {c.teachers.join(", ") || "sin profesor"}</p>
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
