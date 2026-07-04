"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/useAuth";
import { listStudents, createStudent, StudentRow, ApiError } from "@/lib/api";
import { Shell, PageHeader } from "@/components/ui/TopBar";
import { Card, Button, Field, Avatar, Badge, Skeleton, EmptyState } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { useRegisterRefresh } from "@/components/Refresh";
import { IconPlus, IconSearch, IconUsers, IconChevron } from "@/components/ui/Icons";

const EMPTY = { fullName: "", email: "", password: "", documentId: "", phone: "", qrFixedCode: "" };

export default function AdminStudents() {
  const { ready } = useAuth("admin");
  const toast = useToast();
  const [rows, setRows] = useState<StudentRow[] | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await listStudents());
    } catch {
      setRows([]);
    }
  }, []);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);
  useRegisterRefresh(load);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = query.toLowerCase().trim();
    if (!q) return rows;
    return rows.filter((s) => s.fullName.toLowerCase().includes(q) || s.email.toLowerCase().includes(q));
  }, [rows, query]);

  const submit = async () => {
    setBusy(true);
    try {
      await createStudent({
        fullName: form.fullName,
        email: form.email,
        password: form.password,
        documentId: form.documentId || undefined,
        phone: form.phone || undefined,
        qrFixedCode: form.qrFixedCode || undefined,
      });
      toast.success("Alumno creado.");
      setForm(EMPTY);
      setOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo crear.");
    } finally {
      setBusy(false);
    }
  };

  if (!ready) return null;

  return (
    <Shell>
      <PageHeader
        eyebrow="Administración"
        title="Alumnos"
        subtitle={rows ? `${rows.length} alumno(s) registrados.` : undefined}
        actions={
          <Button onClick={() => setOpen((o) => !o)} icon={<IconPlus />}>
            Nuevo alumno
          </Button>
        }
      />

      {open && (
        <Card className="mb-5 p-5 animate-fade-up">
          <h2 className="mb-4 font-semibold">Nuevo alumno</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Nombre completo" value={form.fullName} onChange={(v) => setForm({ ...form, fullName: v })} />
            <Field label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} type="email" />
            <Field label="Contraseña" value={form.password} onChange={(v) => setForm({ ...form, password: v })} type="password" />
            <Field label="Teléfono (opcional)" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
            <Field label="Documento (opcional)" value={form.documentId} onChange={(v) => setForm({ ...form, documentId: v })} />
            <Field label="Código QR fijo (opcional)" value={form.qrFixedCode} onChange={(v) => setForm({ ...form, qrFixedCode: v })} />
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={submit} loading={busy} disabled={!form.fullName || !form.email || !form.password}>
              Crear alumno
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
          </div>
        </Card>
      )}

      {/* Buscador */}
      <div className="relative mb-4">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-dim">
          <IconSearch />
        </span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre o email…"
          className="field pl-9"
        />
      </div>

      {rows === null && (
        <div className="grid grid-cols-1 gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      )}
      {rows !== null && filtered.length === 0 && (
        <EmptyState icon={<IconUsers />} title="Sin resultados" hint="Probá con otro término o creá un alumno nuevo." />
      )}

      <div className="grid grid-cols-1 gap-2">
        {filtered.map((s) => (
          <Link key={s.id} href={`/admin/students/${s.id}`}>
            <Card hover className="flex items-center gap-3 p-3">
              <Avatar name={s.fullName} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{s.fullName}</p>
                <p className="truncate text-xs text-muted">{s.email}</p>
              </div>
              <Badge tone="muted">QR {s.qrFixedCode}</Badge>
              {!s.isActive && <Badge tone="red">Inactivo</Badge>}
              <span className="text-muted-dim">
                <IconChevron />
              </span>
            </Card>
          </Link>
        ))}
      </div>
    </Shell>
  );
}
