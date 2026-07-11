"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui";
import { IconQr } from "@/components/ui/Icons";

/**
 * Genera y muestra el QR fijo del alumno (a partir de su código) para que la
 * recepción lo escanee. "Ver / imprimir carnet" abre un overlay a PANTALLA COMPLETA
 * (grande y legible en el celular) con botón Volver siempre visible y opción de
 * imprimir (CSS @media print aísla la tarjeta #carnet-print). Reemplaza al viejo
 * window.open, que en mobile se veía diminuto y dejaba al usuario atrapado.
 */
export default function StudentQr({ code, name }: { code: string; name: string }) {
  const [dataUrl, setDataUrl] = useState<string>("");
  const [open, setOpen] = useState(false);

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

  // Con el carnet abierto: cerrar con Escape y bloquear el scroll del fondo.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  return (
    <div className="flex flex-col items-center gap-3">
      {dataUrl ? (
        <div className="rounded-2xl bg-white p-3 shadow-panel">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={dataUrl} alt={`QR de ${name}`} width={180} height={180} className="h-44 w-44" />
        </div>
      ) : (
        <div className="grid h-[204px] w-[204px] place-items-center rounded-2xl bg-ink-700 text-muted-dim">
          <IconQr />
        </div>
      )}
      <p className="font-mono text-xs text-muted">{code}</p>
      <Button
        variant="ghost"
        className="btn-sm"
        onClick={() => setOpen(true)}
        icon={<IconQr />}
        disabled={!dataUrl}
      >
        Ver / imprimir carnet
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-[120] bg-ink-900/95 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={`Carnet de ${name}`}
        >
          {/* Flecha para volver: flotante arriba a la izquierda (siempre visible). */}
          <button
            onClick={() => setOpen(false)}
            aria-label="Volver"
            className="absolute left-4 top-[max(1rem,env(safe-area-inset-top))] z-10 grid h-11 w-11 place-items-center rounded-full border border-white/25 bg-black/40 text-2xl leading-none text-white backdrop-blur transition active:scale-95"
          >
            <span aria-hidden>←</span>
          </button>
          {/* Imprimir: flotante arriba a la derecha. */}
          <button
            onClick={() => window.print()}
            className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-10 inline-flex items-center gap-1.5 rounded-full bg-lime px-4 py-2.5 text-sm font-bold text-ink-900 transition active:scale-95"
          >
            <IconQr /> Imprimir
          </button>

          {/* Carnet a PANTALLA COMPLETA con diseño de card (llena la pantalla, márgenes mínimos). */}
          <div className="flex h-full w-full overflow-y-auto p-3 pt-[max(4.5rem,calc(env(safe-area-inset-top)+4rem))]">
            <div
              id="carnet-print"
              className="flex w-full flex-col items-center justify-center gap-7 rounded-[28px] border-4 bg-white px-6 py-8 text-center"
              style={{ borderColor: "#0B0B0C" }}
            >
              <div>
                <div className="text-lg font-extrabold tracking-[0.2em]" style={{ color: "#0B0B0C" }}>
                  MONTEVIDEO MAMBO
                </div>
                <div
                  className="mt-2 inline-block rounded-full px-4 py-1 text-xs font-bold tracking-[0.16em]"
                  style={{ background: "#C4F82B", color: "#0B0B0C" }}
                >
                  CARNET DE ALUMNO
                </div>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={dataUrl}
                alt={`QR de ${name}`}
                className="aspect-square w-[80vw] max-w-[380px]"
              />
              <div>
                <div className="text-2xl font-bold" style={{ color: "#0B0B0C" }}>
                  {name}
                </div>
                <div className="mt-1 font-mono text-sm" style={{ color: "#555" }}>
                  {code}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
