"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/useAuth";
import { listClasses, createClass, updateClass, setClassActive, listTeachers, ClassRow, TeacherRow, ApiError } from "@/lib/api";
import { Shell, PageHeader } from "@/components/ui/TopBar";
import { Card, Button, Field, Badge, Skeleton, EmptyState } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { useDialog } from "@/components/ui/Dialog";
import { WEEKDAYS } from "@/components/format";
import { IconPlus, IconCalendar, IconClock } from "@/components/ui/Icons";

export default function AdminClasses() {
  const { ready } = useAuth("admin");
  const toast = useToast();
  const dialog = useDialog();
  const [rows, setRows] = useState<ClassRow[] | null>(null);
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const emptyForm = {
    name: "",
    style: "",
    level: "",
    weekday: 1,
    startTime: "20:00",
    endTime: "21:30",
    teacherIds: [] as string[],
  };
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(async () => {
    try {
      setRows(await listClasses());
      setTeachers(await listTeachers());
    } catch {
      setRows([]);
    }
  }, []);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  const startCreate = () => {
    setEditId(null);
    setForm(emptyForm);
    setOpen((o) => !o);
  };
  const startEdit = (c: ClassRow) => {
    setEditId(c.id);
    setForm({
      name: c.name,
      style: c.style,
      level: c.level,
      weekday: c.weekday,
      startTime: c.startTime.slice(0, 5),
      endTime: c.endTime.slice(0, 5),
      teacherIds: c.teacherIds ?? [],
    });
    setOpen(true);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async () => {
    setBusy(true);
    try {
      const body = {
        name: form.name,
        style: form.style,
        level: form.level,
        weekday: form.weekday,
        startTime: form.startTime,
        endTime: form.endTime,
        teacherIds: form.teacherIds,
      };
      if (editId) {
        await updateClass(editId, body);
        toast.success("Clase actualizada.");
      } else {
        await createClass(body);
        toast.success("Clase creada.");
      }
      setForm(emptyForm);
      setEditId(null);
      setOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (c: ClassRow) => {
    const next = !c.isActive;
    if (!next) {
      const ok = await dialog.confirm({
        title: `Desactivar "${c.name}"`,
        message: "La clase deja de aparecer en la grilla activa. No se borran las sesiones ya generadas y podés reactivarla cuando quieras.",
        confirmLabel: "Desactivar",
        tone: "danger",
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      await setClassActive(c.id, next);
      toast.success(next ? "Clase reactivada." : "Clase desactivada.");
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo cambiar el estado.");
    } finally {
      setBusy(false);
    }
  };

  if (!ready) return null;

  // Agrupar por día
  const byDay = new Map<number, ClassRow[]>();
  (rows ?? []).forEach((c) => {
    const arr = byDay.get(c.weekday) ?? [];
    arr.push(c);
    byDay.set(c.weekday, arr);
  });

  return (
    <Shell>
      <PageHeader
        eyebrow="Administración"
        title="Clases"
        subtitle={rows ? `${rows.length} clase(s) en la grilla.` : undefined}
        actions={
          <Button onClick={startCreate} icon={<IconPlus />}>
            Nueva clase
          </Button>
        }
      />

      {open && (
        <Card className="mb-5 p-5 animate-fade-up">
          <h2 className="mb-4 font-semibold">{editId ? "Editar clase" : "Nueva clase"}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Nombre" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
            <Field label="Estilo" value={form.style} onChange={(v) => setForm({ ...form, style: v })} />
            <Field label="Nivel" value={form.level} onChange={(v) => setForm({ ...form, level: v })} />
            <label className="block">
              <span className="label">Día</span>
              <select
                value={form.weekday}
                onChange={(e) => setForm({ ...form, weekday: Number(e.target.value) })}
                className="field"
              >
                {WEEKDAYS.map((d, i) => (
                  <option key={i} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <Field label="Hora inicio" value={form.startTime} onChange={(v) => setForm({ ...form, startTime: v })} type="time" />
            <Field label="Hora fin" value={form.endTime} onChange={(v) => setForm({ ...form, endTime: v })} type="time" />
          </div>
          <label className="mt-3 block">
            <span className="label">Profesores</span>
            <select
              multiple
              value={form.teacherIds}
              onChange={(e) =>
                setForm({ ...form, teacherIds: Array.from(e.target.selectedOptions).map((o) => o.value) })
              }
              className="field h-24"
            >
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.fullName}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-4 flex gap-2">
            <Button onClick={submit} loading={busy} disabled={!form.name || !form.style || !form.level}>
              {editId ? "Guardar cambios" : "Crear clase"}
            </Button>
            <Button variant="ghost" onClick={() => { setOpen(false); setEditId(null); }}>
              Cancelar
            </Button>
          </div>
        </Card>
      )}

      {rows === null && (
        <div className="grid grid-cols-1 gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      )}
      {rows !== null && rows.length === 0 && (
        <EmptyState
          icon={<IconCalendar />}
          title="No hay clases en la grilla"
          hint="Creá una clase o cargá los horarios 2026 desde el panel."
        />
      )}

      <div className="grid grid-cols-1 gap-4">
        {[1, 2, 3, 4, 5, 6, 0].map((wd) => {
          const list = byDay.get(wd);
          if (!list || list.length === 0) return null;
          return (
            <Card key={wd} className="p-5 animate-fade-up">
              <h2 className="mb-3 font-display text-lg tracking-wide text-lime">{WEEKDAYS[wd]}</h2>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {list
                  .sort((a, b) => a.startTime.localeCompare(b.startTime))
                  .map((c) => (
                    <div
                      key={c.id}
                      className={`rounded-xl border border-ink-500/60 bg-ink-900/40 p-3 ${
                        c.isActive ? "" : "opacity-50"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-lime/15 text-xs font-semibold text-lime">
                          {c.startTime.slice(0, 5)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{c.name}</p>
                          <p className="flex items-center gap-1 truncate text-xs text-muted">
                            <IconClock className="shrink-0 text-[10px]" /> {c.startTime.slice(0, 5)}–{c.endTime.slice(0, 5)}
                            {c.teachers.length > 0 && <span className="truncate"> · {c.teachers.join(", ")}</span>}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <Badge tone="muted">{c.level}</Badge>
                          {!c.isActive && <Badge tone="red">Inactiva</Badge>}
                        </div>
                      </div>
                      <div className="mt-2.5 flex justify-end gap-2 border-t border-ink-500/40 pt-2.5">
                        <Button variant="ghost" className="btn-sm" onClick={() => startEdit(c)} disabled={busy}>
                          Editar
                        </Button>
                        <Button
                          variant={c.isActive ? "danger" : "primary"}
                          className="btn-sm"
                          onClick={() => toggleActive(c)}
                          disabled={busy}
                        >
                          {c.isActive ? "Baja" : "Alta"}
                        </Button>
                      </div>
                    </div>
                  ))}
              </div>
            </Card>
          );
        })}
      </div>
    </Shell>
  );
}
