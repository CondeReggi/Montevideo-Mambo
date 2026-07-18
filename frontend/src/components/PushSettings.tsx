"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Button, Badge, Field } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { IconBell, IconCheck, IconSpark } from "@/components/ui/Icons";
import { currentPushState, enablePush, disablePush, PushState } from "@/lib/push";
import { testPush, broadcastPush, ApiError } from "@/lib/api";

/**
 * Ajustes de notificaciones push. Toggle por dispositivo para cualquier usuario y,
 * para admin, un formulario de difusión (a todos / alumnos / profesores).
 */
export default function PushSettings({ isAdmin = false }: { isAdmin?: boolean }) {
  const toast = useToast();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const { state } = await currentPushState();
    setState(state);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const turnOn = async () => {
    setBusy(true);
    try {
      await enablePush();
      toast.success("Notificaciones activadas en este dispositivo.");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo activar.");
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    try {
      await disablePush();
      toast.info("Notificaciones desactivadas en este dispositivo.");
      await refresh();
    } catch {
      toast.error("No se pudo desactivar.");
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setBusy(true);
    try {
      const { sent } = await testPush();
      toast.success(sent > 0 ? "Enviada. Debería llegarte en unos segundos." : "No hay dispositivos suscriptos.");
    } catch {
      toast.error("No se pudo enviar la prueba.");
    } finally {
      setBusy(false);
    }
  };

  // Si el backend no tiene las claves VAPID, no mostramos nada (igual criterio que MP).
  if (state === null || state === "unsupported" || state === "disabled") {
    if (state === "unsupported")
      return (
        <Card className="mt-5 p-5">
          <h2 className="mb-1 flex items-center gap-2 font-semibold">
            <span className="text-lime"><IconBell /></span> Notificaciones
          </h2>
          <p className="text-sm text-muted">
            Este navegador no soporta notificaciones. En iPhone, primero instalá la app en la
            pantalla de inicio (iOS 16.4 o superior).
          </p>
        </Card>
      );
    return null;
  }

  return (
    <>
      <Card className="mt-5 p-5">
        <h2 className="mb-1 flex items-center gap-2 font-semibold">
          <span className="text-lime"><IconBell /></span> Notificaciones
        </h2>
        <p className="mb-4 text-sm text-muted">
          Recibí avisos de clases, cuponeras, pagos y novedades de la academia en este dispositivo.
        </p>

        {state === "denied" ? (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
            Bloqueaste las notificaciones en este navegador. Habilitalas desde el candado de la barra
            de direcciones y volvé a intentar.
          </div>
        ) : state === "on" ? (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-xl border border-lime/40 bg-lime/10 px-4 py-2.5 text-sm text-lime">
              <IconCheck /> Activadas en este dispositivo
            </div>
            <Button variant="ghost" onClick={sendTest} loading={busy}>Enviar prueba</Button>
            <Button variant="ghost" onClick={turnOff} disabled={busy}>Desactivar</Button>
          </div>
        ) : (
          <Button onClick={turnOn} loading={busy} icon={<IconBell />}>
            Activar notificaciones
          </Button>
        )}
      </Card>

      {isAdmin && <AdminBroadcast />}
    </>
  );
}

function AdminBroadcast() {
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [target, setTarget] = useState("all");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!title.trim() || !body.trim()) {
      toast.error("Completá título y mensaje.");
      return;
    }
    setBusy(true);
    try {
      const { sent } = await broadcastPush({ title: title.trim(), body: body.trim(), target });
      toast.success(`Enviada a ${sent} dispositivo(s).`);
      setTitle("");
      setBody("");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo enviar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mt-5 p-5">
      <h2 className="mb-1 flex items-center gap-2 font-semibold">
        <span className="text-lime"><IconSpark /></span> Enviar aviso (difusión)
      </h2>
      <p className="mb-4 text-sm text-muted">
        Mandá una notificación a todos, o solo a alumnos o profesores.
      </p>
      <div className="grid grid-cols-1 gap-3">
        <Field label="Título" value={title} onChange={setTitle} placeholder="Clase suspendida hoy" />
        <label className="block">
          <span className="label">Mensaje</span>
          <textarea
            className="field min-h-[80px]"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Detalle del aviso…"
          />
        </label>
        <label className="block">
          <span className="label">Para</span>
          <select className="field" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="all">Todos</option>
            <option value="students">Solo alumnos</option>
            <option value="teachers">Solo profesores</option>
          </select>
        </label>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Button onClick={send} loading={busy} disabled={!title.trim() || !body.trim()} icon={<IconBell />}>
          Enviar aviso
        </Button>
        <Badge tone="muted">Solo llega a quienes activaron las notificaciones</Badge>
      </div>
    </Card>
  );
}
