"use client";

import { useState } from "react";
import { useAuth } from "@/lib/useAuth";
import { usePwaInstall } from "@/lib/usePwaInstall";
import { Shell, PageHeader } from "@/components/ui/TopBar";
import { Card, Button, Badge } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { IconDownload, IconCheck, IconShare, IconGear } from "@/components/ui/Icons";
import PushSettings from "@/components/PushSettings";

export default function SettingsPage() {
  const { ready, session } = useAuth();
  const toast = useToast();
  const { canPrompt, isIOS, installed, promptInstall } = usePwaInstall();
  const [busy, setBusy] = useState(false);

  if (!ready) return null;

  const install = async () => {
    setBusy(true);
    try {
      const r = await promptInstall();
      if (r === "accepted") toast.success("¡App instalada!");
      else if (r === "dismissed") toast.info("Instalación cancelada.");
      else toast.info("Usá el menú del navegador para instalarla.");
    } finally {
      setBusy(false);
    }
  };

  const reactivarAviso = () => {
    localStorage.removeItem("mambo.installPromptSeen");
    toast.success("El aviso de instalación volverá a aparecer.");
  };

  return (
    <Shell max="max-w-2xl">
      <PageHeader eyebrow="Configuración" title="Ajustes" subtitle="Instalá la app y gestioná las preferencias." />

      {/* Instalar como app (PWA) */}
      <Card className="p-5">
        <h2 className="mb-1 flex items-center gap-2 font-semibold">
          <span className="text-lime"><IconDownload /></span> Instalar como aplicación
        </h2>
        <p className="mb-4 text-sm text-muted">
          Agregá Montevideo MAMBO a tu pantalla de inicio para abrirla a pantalla completa,
          con su ícono, como una app.
        </p>

        {installed ? (
          <div className="flex items-center gap-2 rounded-xl border border-lime/40 bg-lime/10 px-4 py-3 text-sm text-lime">
            <IconCheck /> Ya está instalada en este dispositivo.
          </div>
        ) : canPrompt ? (
          <Button onClick={install} loading={busy} icon={<IconDownload />}>
            Instalar aplicación
          </Button>
        ) : isIOS ? (
          <div className="rounded-xl border border-ink-500/70 bg-ink-900/50 p-4 text-sm">
            <p className="mb-2 flex items-center gap-2 font-medium text-foreground">
              <IconShare /> En iPhone (Safari):
            </p>
            <ol className="ml-4 list-decimal space-y-1 text-muted">
              <li>Tocá el botón <b className="text-foreground">Compartir</b>.</li>
              <li>Elegí <b className="text-foreground">“Agregar a inicio”</b>.</li>
              <li>Confirmá con <b className="text-foreground">Agregar</b>.</li>
            </ol>
          </div>
        ) : (
          <div className="rounded-xl border border-ink-500/70 bg-ink-900/50 p-4 text-sm text-muted">
            <p className="mb-2 font-medium text-foreground">Desde el navegador:</p>
            <ol className="ml-4 list-decimal space-y-1">
              <li>Abrí el menú del navegador (⋮).</li>
              <li>Elegí <b className="text-foreground">“Instalar app”</b> o <b className="text-foreground">“Agregar a pantalla de inicio”</b>.</li>
            </ol>
            <p className="mt-2 text-xs text-muted-dim">
              (El botón directo aparece en Chrome/Edge cuando la app está publicada con HTTPS.)
            </p>
          </div>
        )}
      </Card>

      {/* Preferencias del aviso */}
      <Card className="mt-5 p-5">
        <h2 className="mb-1 flex items-center gap-2 font-semibold">
          <span className="text-lime"><IconGear /></span> Aviso de instalación
        </h2>
        <p className="mb-4 text-sm text-muted">
          El aviso para instalar aparece una vez. Si lo cerraste, podés volver a mostrarlo.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" onClick={reactivarAviso}>
            Volver a mostrar el aviso
          </Button>
          <Badge tone="muted">Se muestra al abrir la app</Badge>
        </div>
      </Card>

      {/* Notificaciones push (aparece solo si el backend las tiene habilitadas) */}
      <PushSettings isAdmin={session?.roles.includes("admin") ?? false} />
    </Shell>
  );
}
