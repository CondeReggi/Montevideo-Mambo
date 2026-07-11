"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import { IconQr } from "@/components/ui/Icons";

/**
 * Pantalla dedicada del carnet del alumno (ruta propia /carnet?code=...&name=...).
 * Se abre desde "Ver / imprimir carnet": ocupa toda la pantalla, es responsive y
 * muestra la card grande. Arriba, la flecha para volver a la pantalla anterior.
 * Imprimir aísla la tarjeta #carnet-print (ver @media print en globals.css).
 */
function CarnetView() {
  const router = useRouter();
  const params = useSearchParams();
  const code = params.get("code") ?? "";
  const name = params.get("name") ?? "";
  const [dataUrl, setDataUrl] = useState<string>("");

  useEffect(() => {
    if (!code) return;
    QRCode.toDataURL(code, {
      width: 512,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#0B0B0C", light: "#FFFFFF" },
    })
      .then(setDataUrl)
      .catch(() => setDataUrl(""));
  }, [code]);

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/");
  };

  return (
    <main className="relative flex min-h-[100dvh] flex-col bg-ink-900 text-white">
      {/* Barra: flecha para volver (izq) + imprimir (der). No se imprime. */}
      <header className="flex items-center justify-between px-4 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
        <button
          onClick={goBack}
          aria-label="Volver"
          className="grid h-11 w-11 place-items-center rounded-full border border-white/25 bg-white/10 text-2xl leading-none text-white transition active:scale-95"
        >
          <span aria-hidden>←</span>
        </button>
        <button
          onClick={() => window.print()}
          disabled={!dataUrl}
          className="inline-flex items-center gap-1.5 rounded-full bg-lime px-4 py-2.5 text-sm font-bold text-ink-900 transition active:scale-95 disabled:opacity-50"
        >
          <IconQr /> Imprimir
        </button>
      </header>

      {/* Card del carnet: centrada, grande y responsive. */}
      <div className="flex flex-1 items-center justify-center p-4 sm:p-8">
        <div
          id="carnet-print"
          className="flex w-full max-w-md flex-col items-center gap-7 rounded-[28px] border-4 bg-white px-6 py-9 text-center sm:px-10 sm:py-12"
          style={{ borderColor: "#0B0B0C" }}
        >
          <div>
            <div className="text-lg font-extrabold tracking-[0.2em] sm:text-xl" style={{ color: "#0B0B0C" }}>
              MONTEVIDEO MAMBO
            </div>
            <div
              className="mt-2 inline-block rounded-full px-4 py-1 text-xs font-bold tracking-[0.16em]"
              style={{ background: "#C4F82B", color: "#0B0B0C" }}
            >
              CARNET DE ALUMNO
            </div>
          </div>

          {dataUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={dataUrl}
              alt={`QR de ${name}`}
              className="aspect-square w-[min(78vw,340px)]"
            />
          ) : (
            <div className="grid aspect-square w-[min(78vw,340px)] place-items-center rounded-2xl bg-neutral-100 text-neutral-400">
              {code ? "Generando QR…" : "Sin código"}
            </div>
          )}

          <div>
            <div className="text-2xl font-bold sm:text-3xl" style={{ color: "#0B0B0C" }}>
              {name || "Alumno"}
            </div>
            <div className="mt-1 font-mono text-sm" style={{ color: "#555" }}>
              {code}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function CarnetPage() {
  // useSearchParams requiere un límite de Suspense en App Router.
  return (
    <Suspense fallback={<main className="min-h-[100dvh] bg-ink-900" />}>
      <CarnetView />
    </Suspense>
  );
}
