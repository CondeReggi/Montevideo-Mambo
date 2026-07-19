"use client";

import { useSyncExternalStore } from "react";
import { subscribeConnecting, isConnecting } from "@/lib/connecting";
import { Spinner } from "@/components/ui";

/**
 * Indicador global "Conectando…": aparece cuando una petición al backend tarda más
 * de 3s (cold start de Render). Da feedback sin depender de poner un spinner en cada
 * botón, y no parpadea en las peticiones rápidas.
 */
export default function ConnectingIndicator() {
  const connecting = useSyncExternalStore(subscribeConnecting, isConnecting, () => false);
  if (!connecting) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 top-3 z-[200] flex -translate-x-1/2 items-center gap-2 rounded-full border border-lime/30 bg-ink-900/90 px-4 py-2 text-sm text-foreground shadow-lg backdrop-blur-md animate-fade-in"
    >
      <Spinner className="h-4 w-4 text-lime" />
      Conectando…
    </div>
  );
}
