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
          className="fixed inset-0 z-[120] flex flex-col bg-black/85 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={`Carnet de ${name}`}
        >
          {/* Barra superior: Volver (siempre visible) + Imprimir. */}
          <div className="flex items-center justify-between px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <button
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition active:scale-95"
            >
              <span aria-hidden>←</span> Volver
            </button>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-lime px-4 py-2.5 text-sm font-bold text-ink-900 transition active:scale-95"
            >
              <IconQr /> Imprimir
            </button>
          </div>

          {/* Carnet grande y centrado: ocupa la pantalla en el celular. */}
          <div className="flex flex-1 items-center justify-center overflow-auto p-4">
            <div
              id="carnet-print"
              className="w-full max-w-sm rounded-3xl border-4 bg-white px-6 py-8 text-center"
              style={{ borderColor: "#0B0B0C" }}
            >
              <div className="text-[13px] font-extrabold tracking-[0.18em]" style={{ color: "#0B0B0C" }}>
                MONTEVIDEO MAMBO
              </div>
              <div
                className="mt-1.5 inline-block rounded-full px-3 py-0.5 text-[11px] font-bold tracking-[0.14em]"
                style={{ background: "#C4F82B", color: "#0B0B0C" }}
              >
                CARNET DE ALUMNO
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={dataUrl}
                alt={`QR de ${name}`}
                className="mx-auto my-6 aspect-square w-[72vw] max-w-[300px]"
              />
              <div className="text-xl font-bold" style={{ color: "#0B0B0C" }}>
                {name}
              </div>
              <div className="mt-1 font-mono text-sm" style={{ color: "#555" }}>
                {code}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
