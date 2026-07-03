"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { usePwaInstall } from "@/lib/usePwaInstall";
import { Button } from "@/components/ui";
import { IconDownload, IconShare, IconX } from "@/components/ui/Icons";

const KEY = "mambo.installPromptSeen";

/**
 * Aviso para instalar la PWA. Aparece la PRIMERA vez (tras login) y no vuelve una vez
 * que el usuario lo acepta o lo descarta. Desde Configuración se puede volver a instalar.
 */
export default function InstallBanner() {
  const router = useRouter();
  const pathname = usePathname();
  const { canPrompt, isIOS, installed, promptInstall } = usePwaInstall();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (installed) return;
    if (typeof window !== "undefined" && localStorage.getItem(KEY)) return;
    setShow(true);
  }, [installed]);

  if (!show || installed || pathname === "/settings") return null;

  const dismiss = () => {
    localStorage.setItem(KEY, "1");
    setShow(false);
  };
  const install = async () => {
    if (canPrompt) {
      await promptInstall();
      dismiss();
    } else if (isIOS) {
      // iOS: no hay prompt nativo; el detalle está más abajo y en Configuración.
      dismiss();
    } else {
      dismiss();
      router.push("/settings");
    }
  };

  return (
    <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-lime/40 bg-lime/5 p-4 shadow-glow-sm animate-fade-up sm:flex-row sm:items-center">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-lime/15 text-xl text-lime">
        <IconDownload />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Instalá la app en tu celular</p>
        <p className="mt-0.5 text-sm text-muted">
          {isIOS
            ? "En Safari tocá Compartir y luego “Agregar a inicio” para tenerla como app."
            : "Accedé más rápido desde tu pantalla de inicio, a pantalla completa."}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button className="btn-sm" onClick={install} icon={isIOS ? <IconShare /> : <IconDownload />}>
          {isIOS ? "Cómo instalar" : "Instalar app"}
        </Button>
        <button
          onClick={dismiss}
          title="Ahora no"
          className="grid h-8 w-8 place-items-center rounded-lg text-muted transition hover:bg-ink-700 hover:text-foreground"
        >
          <IconX />
        </button>
      </div>
    </div>
  );
}
