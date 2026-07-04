"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/useAuth";
import {
  listTeachers, createTeacher, updateTeacher, setTeacherActive,
  TeacherRow, ApiError,
} from "@/lib/api";
import { Shell, PageHeader } from "@/components/ui/TopBar";
import { Card, Button, Field, Badge, Avatar, Skeleton, EmptyState } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { useDialog } from "@/components/ui/Dialog";
import { useRegisterRefresh } from "@/components/Refresh";
import { IconPlus, IconUsers } from "@/components/ui/Icons";

export default function AdminTeachers() {
  const { ready } = useAuth("admin");
  const toast = useToast();
  const dialog = useDialog();
  const [rows, setRows] = useState<TeacherRow[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const emptyForm = { fullName: "", email: "", password: "", bio: "" };
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(async () => {
    try {
      setRows(await listTeachers());
    } catch {
      setRows([]);
    }
  }, []);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);
  useRegisterRefresh(load);

  const submit = async () => {
    setBusy(true);
    try {
      await createTeacher({
        fullName: form.fullName,
        email: form.email,
        password: form.password,
        bio: form.bio || undefined,
      });
      toast.success("Profesor creado.");
      setForm(emptyForm);
      setOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo crear.");
    } finally {
      setBusy(false);
    }
  };

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo procesar.");
    } finally {
      setBusy(false);
    }
  };

  const edit = async (t: TeacherRow) => {
    const res = await dialog.prompt({
      title: "Editar profesor",
      fields: [
        { name: "fullName", label: "Nombre completo", defaultValue: t.fullName },
        { name: "bio", label: "Bio (opcional)", type: "textarea", defaultValue: t.bio ?? "" },
      ],
      confirmLabel: "Guardar",
    });
    if (res === null) return;
    if (!res.fullName.trim()) {
      toast.error("El nombre no puede quedar vacío.");
      return;
    }
    return run(() => updateTeacher(t.id, { fullName: res.fullName, bio: res.bio || undefined }), "Profesor actualizado.");
  };

  const toggle = async (t: TeacherRow) => {
    const next = !t.isActive;
    if (!next) {
      const ok = await dialog.confirm({
        title: `Dar de baja a ${t.fullName}`,
        message: "El profesor deja de estar activo y no podrá ingresar. Podés reactivarlo cuando quieras.",
        confirmLabel: "Dar de baja",
        tone: "danger",
      });
      if (!ok) return;
    }
    return run(() => setTeacherActive(t.id, next), next ? "Profesor reactivado." : "Profesor dado de baja.");
  };

  if (!ready) return null;

  return (
    <Shell>
      <PageHeader
        eyebrow="Administración"
        title="Profesores"
        subtitle={rows ? `${rows.length} profesor(es).` : undefined}
        actions={
          <Button onClick={() => setOpen((o) => !o)} icon={<IconPlus />}>
            Nuevo profesor
          </Button>
        }
      />

      {open && (
        <Card className="mb-5 p-5 animate-fade-up">
          <h2 className="mb-4 font-semibold">Nuevo profesor</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Nombre completo" value={form.fullName} onChange={(v) => setForm({ ...form, fullName: v })} />
            <Field label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} type="email" />
            <Field label="Contraseña" value={form.password} onChange={(v) => setForm({ ...form, password: v })} type="password" />
            <Field label="Bio (opcional)" value={form.bio} onChange={(v) => setForm({ ...form, bio: v })} placeholder="Estilos, trayectoria…" />
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={submit} loading={busy} disabled={!form.fullName || !form.email || !form.password}>
              Crear profesor
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
          </div>
        </Card>
      )}

      {rows === null && (
        <div className="grid grid-cols-1 gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      )}
      {rows !== null && rows.length === 0 && (
        <EmptyState icon={<IconUsers />} title="Sin profesores" hint="Creá el primer profesor para asignarlo a las clases." />
      )}

      <div className="grid grid-cols-1 gap-3">
        {rows?.map((t) => (
          <Card key={t.id} className={`p-4 animate-fade-up ${t.isActive ? "" : "opacity-60"}`}>
            <div className="flex items-center gap-3">
              <Avatar name={t.fullName} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  {t.fullName} {!t.isActive && <Badge tone="red">Inactivo</Badge>}
                </p>
                <p className="truncate text-xs text-muted">{t.email}</p>
                {t.bio && <p className="mt-0.5 truncate text-xs text-muted-dim">{t.bio}</p>}
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2 border-t border-ink-500/40 pt-3">
              <Button variant="ghost" className="btn-sm" onClick={() => edit(t)} disabled={busy}>
                Editar
              </Button>
              <Button
                variant={t.isActive ? "danger" : "primary"}
                className="btn-sm"
                onClick={() => toggle(t)}
                disabled={busy}
              >
                {t.isActive ? "Baja" : "Alta"}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </Shell>
  );
}
