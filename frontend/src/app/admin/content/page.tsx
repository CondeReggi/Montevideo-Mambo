"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/useAuth";
import {
  listAdminContent, createContent, updateContent, setContentPublished, deleteContent,
  Content, ContentInput, ContentType, ApiError,
} from "@/lib/api";
import { Shell, PageHeader } from "@/components/ui/TopBar";
import { Card, Button, Field, Badge, Skeleton, EmptyState } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { useDialog } from "@/components/ui/Dialog";
import { useRegisterRefresh } from "@/components/Refresh";
import { IconPlus, IconSpark, IconPin } from "@/components/ui/Icons";
import { contentTypeLabel, fmtDate } from "@/components/format";

const TYPES: ContentType[] = ["News", "Update", "Showcase", "Workshop", "Event"];

const emptyForm: ContentInput = {
  type: "News",
  title: "",
  body: "",
  imagePath: "",
  eventDate: "",
  externalUrl: "",
  locationName: "",
  locationAddress: "",
  latitude: null,
  longitude: null,
  isPublished: true,
};

export default function AdminContent() {
  const { ready } = useAuth("admin");
  const toast = useToast();
  const dialog = useDialog();
  const [rows, setRows] = useState<Content[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ContentInput>(emptyForm);

  const load = useCallback(async () => {
    try {
      setRows(await listAdminContent());
    } catch {
      setRows([]);
    }
  }, []);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);
  useRegisterRefresh(load);

  const set = <K extends keyof ContentInput>(k: K, v: ContentInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  const startNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const startEdit = (c: Content) => {
    setEditingId(c.id);
    setForm({
      type: c.type,
      title: c.title,
      body: c.body ?? "",
      imagePath: "", // vacío = no cambiar la imagen existente
      eventDate: c.eventDate ?? "",
      externalUrl: c.externalUrl ?? "",
      locationName: c.locationName ?? "",
      locationAddress: c.locationAddress ?? "",
      latitude: c.latitude,
      longitude: c.longitude,
      isPublished: c.isPublished,
    });
    setOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async () => {
    if (!form.title.trim()) {
      toast.error("El título es obligatorio.");
      return;
    }
    setBusy(true);
    // Normaliza: strings vacíos -> null; number vacío -> null.
    const payload: ContentInput = {
      ...form,
      body: form.body || null,
      imagePath: form.imagePath || null,
      eventDate: form.eventDate || null,
      externalUrl: form.externalUrl || null,
      locationName: form.locationName || null,
      locationAddress: form.locationAddress || null,
    };
    try {
      if (editingId) {
        await updateContent(editingId, payload);
        toast.success("Contenido actualizado.");
      } else {
        await createContent(payload);
        toast.success("Contenido creado.");
      }
      setOpen(false);
      setForm(emptyForm);
      setEditingId(null);
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar.");
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

  const remove = async (c: Content) => {
    const ok = await dialog.confirm({
      title: `Borrar "${c.title}"`,
      message: "Se elimina definitivamente. Si solo querés que deje de verse, usá Ocultar.",
      confirmLabel: "Borrar",
      tone: "danger",
    });
    if (!ok) return;
    return run(() => deleteContent(c.id), "Contenido borrado.");
  };

  if (!ready) return null;

  return (
    <Shell>
      <PageHeader
        eyebrow="Administración"
        title="Contenidos"
        subtitle={rows ? `${rows.length} contenido(s). Noticias, novedades, muestras, talleres y eventos.` : undefined}
        actions={<Button onClick={startNew} icon={<IconPlus />}>Nuevo contenido</Button>}
      />

      {open && (
        <Card className="mb-5 p-5 animate-fade-up">
          <h2 className="mb-4 font-semibold">{editingId ? "Editar contenido" : "Nuevo contenido"}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="label">Tipo</span>
              <select className="field" value={form.type} onChange={(e) => set("type", e.target.value as ContentType)}>
                {TYPES.map((t) => (
                  <option key={t} value={t}>{contentTypeLabel(t)}</option>
                ))}
              </select>
            </label>
            <Field label="Título" value={form.title} onChange={(v) => set("title", v)} />
            <label className="block sm:col-span-2">
              <span className="label">Descripción</span>
              <textarea
                className="field min-h-[96px]"
                value={form.body ?? ""}
                onChange={(e) => set("body", e.target.value)}
                placeholder="Detalle de la noticia, taller o evento…"
              />
            </label>
            <Field label="Fecha (opcional)" type="date" value={form.eventDate ?? ""} onChange={(v) => set("eventDate", v)} />
            <Field
              label="Imagen: URL o ruta (opcional)"
              value={form.imagePath ?? ""}
              onChange={(v) => set("imagePath", v)}
              placeholder={editingId ? "Dejar vacío para no cambiarla" : "https://…/flyer.jpg"}
            />
            <Field label="Link externo (opcional)" value={form.externalUrl ?? ""} onChange={(v) => set("externalUrl", v)} placeholder="https://…" />
            <Field label="Lugar (opcional)" value={form.locationName ?? ""} onChange={(v) => set("locationName", v)} placeholder="MAMBO — Salón principal" />
            <Field label="Dirección (opcional)" value={form.locationAddress ?? ""} onChange={(v) => set("locationAddress", v)} placeholder="Pablo de María 1474" />
            <Field
              label="Latitud (opcional)"
              type="number"
              value={form.latitude?.toString() ?? ""}
              onChange={(v) => set("latitude", v === "" ? null : Number(v))}
            />
            <Field
              label="Longitud (opcional)"
              type="number"
              value={form.longitude?.toString() ?? ""}
              onChange={(v) => set("longitude", v === "" ? null : Number(v))}
            />
          </div>

          <label className="mt-4 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isPublished} onChange={(e) => set("isPublished", e.target.checked)} />
            Publicado (visible para los alumnos)
          </label>

          <div className="mt-4 flex gap-2">
            <Button onClick={submit} loading={busy} disabled={!form.title.trim()}>
              {editingId ? "Guardar cambios" : "Crear contenido"}
            </Button>
            <Button variant="ghost" onClick={() => { setOpen(false); setEditingId(null); }}>Cancelar</Button>
          </div>
        </Card>
      )}

      {rows === null && (
        <div className="grid grid-cols-1 gap-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
      )}
      {rows !== null && rows.length === 0 && (
        <EmptyState icon={<IconSpark />} title="Sin contenidos" hint="Creá la primera noticia, taller o evento para que lo vean los alumnos." />
      )}

      <div className="grid grid-cols-1 gap-3">
        {rows?.map((c) => (
          <Card key={c.id} className={`p-4 animate-fade-up ${c.isPublished ? "" : "opacity-70"}`}>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="lime">{contentTypeLabel(c.type)}</Badge>
              {c.isPublished ? <Badge tone="lime">Publicado</Badge> : <Badge tone="amber">Borrador</Badge>}
              {c.eventDate && <span className="text-xs text-muted">{fmtDate(c.eventDate)}</span>}
            </div>
            <p className="mt-2 font-semibold">{c.title}</p>
            {c.body && <p className="mt-0.5 line-clamp-2 text-sm text-muted">{c.body}</p>}
            {(c.locationName || c.locationAddress) && (
              <p className="mt-1 flex items-center gap-1 text-xs text-muted">
                <IconPin /> {c.locationName || c.locationAddress}
              </p>
            )}
            <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-ink-500/40 pt-3">
              <Button variant="ghost" className="btn-sm" onClick={() => startEdit(c)} disabled={busy}>Editar</Button>
              <Button
                variant="ghost"
                className="btn-sm"
                onClick={() => run(() => setContentPublished(c.id, !c.isPublished), c.isPublished ? "Ocultado." : "Publicado.")}
                disabled={busy}
              >
                {c.isPublished ? "Ocultar" : "Publicar"}
              </Button>
              <Button variant="danger" className="btn-sm" onClick={() => remove(c)} disabled={busy}>Borrar</Button>
            </div>
          </Card>
        ))}
      </div>
    </Shell>
  );
}
