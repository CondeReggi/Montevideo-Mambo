"use client";

import { useCallback, useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type MamboWindow = Window & {
  __mamboBIP?: BeforeInstallPromptEvent | null;
  __mamboInstalled?: boolean;
};

/**
 * Estado e interacción de instalación PWA.
 * - `canPrompt`: el navegador ofrece instalación nativa (Android/Chrome, escritorio) →
 *   el botón instala con UN toque, sin ir a "Compartir".
 * - `isIOS`: en iPhone la instalación es manual (Safari → Compartir → Agregar a inicio);
 *   Apple no permite instalar por código.
 * - `installed`: la app ya corre instalada (standalone).
 *
 * El evento `beforeinstallprompt` se captura en un script del <head> (layout) apenas
 * carga la página y se guarda en window.__mamboBIP, porque Chrome lo dispara antes de
 * que React monte y si no se pierde.
 */
export function usePwaInstall() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const w = window as MamboWindow;

    // 1) Lo que ya haya capturado el script temprano.
    if (w.__mamboBIP) setDeferred(w.__mamboBIP);
    if (w.__mamboInstalled) setInstalled(true);

    // 2) Seguir escuchando por si llega después.
    const onBip = () => { if (w.__mamboBIP) setDeferred(w.__mamboBIP); };
    const onBipDirect = (e: Event) => {
      e.preventDefault();
      w.__mamboBIP = e as BeforeInstallPromptEvent;
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => { setInstalled(true); setDeferred(null); w.__mamboBIP = null; };

    window.addEventListener("mambo-bip", onBip);
    window.addEventListener("mambo-installed", onInstalled);
    window.addEventListener("beforeinstallprompt", onBipDirect);
    window.addEventListener("appinstalled", onInstalled);

    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) setInstalled(true);

    return () => {
      window.removeEventListener("mambo-bip", onBip);
      window.removeEventListener("mambo-installed", onInstalled);
      window.removeEventListener("beforeinstallprompt", onBipDirect);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const isIOS =
    typeof navigator !== "undefined" &&
    /iphone|ipad|ipod/i.test(navigator.userAgent) &&
    !/crios|fxios/i.test(navigator.userAgent); // en iOS sólo Safari instala

  const promptInstall = useCallback(async (): Promise<"accepted" | "dismissed" | "unavailable"> => {
    const w = window as MamboWindow;
    const evt = deferred ?? w.__mamboBIP ?? null;
    if (!evt) return "unavailable";
    await evt.prompt();
    const { outcome } = await evt.userChoice;
    w.__mamboBIP = null;
    setDeferred(null);
    return outcome;
  }, [deferred]);

  return { canPrompt: !!deferred, isIOS, installed, promptInstall };
}
