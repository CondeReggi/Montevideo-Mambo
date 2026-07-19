"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Límite de error de la app: si una pantalla lanza una excepción de cliente, en vez
 * de quedar trabado en la pantalla blanca de error sin salida, se muestra esto con
 * botones para reintentar o volver al inicio.
 */
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    // Queda en consola para diagnóstico.
    console.error(error);
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center bg-ink px-6 text-center">
      <div className="max-w-md">
        <h1 className="font-display text-3xl tracking-wide text-lime">Ups, algo falló</h1>
        <p className="mt-3 text-sm text-muted-soft">
          Ocurrió un error inesperado en la app. Podés reintentar o volver al inicio.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button onClick={reset} className="btn-primary btn-sm">
            Reintentar
          </button>
          <Link href="/" className="btn-ghost btn-sm">
            Volver al inicio
          </Link>
        </div>
      </div>
    </main>
  );
}
