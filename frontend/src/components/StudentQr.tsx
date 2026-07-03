"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui";
import { IconQr } from "@/components/ui/Icons";

/**
 * Genera y muestra el QR fijo del alumno (a partir de su código) para que la
 * recepción lo escanee. Incluye impresión en una ventana limpia (carnet).
 */
export default function StudentQr({ code, name }: { code: string; name: string }) {
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

  const print = () => {
    if (!dataUrl) return;
    const w = window.open("", "_blank", "width=420,height=560");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>QR ${name}</title>
      <style>
        *{margin:0;box-sizing:border-box;font-family:Arial,Helvetica,sans-serif}
        body{display:flex;align-items:center;justify-content:center;min-height:100vh;background:#fff}
        .card{border:3px solid #0B0B0C;border-radius:20px;padding:28px 24px;text-align:center;width:340px}
        .brand{font-weight:800;letter-spacing:.18em;font-size:13px;color:#0B0B0C}
        .accent{display:inline-block;background:#C4F82B;padding:2px 10px;border-radius:999px;margin-top:6px;font-size:11px;letter-spacing:.14em;font-weight:700}
        img{width:260px;height:260px;margin:18px auto;display:block}
        .name{font-weight:700;font-size:18px;color:#0B0B0C}
        .code{font-family:monospace;font-size:13px;color:#555;margin-top:4px}
        @media print{@page{margin:0}}
      </style></head><body>
      <div class="card">
        <div class="brand">MONTEVIDEO MAMBO</div>
        <div class="accent">CARNET DE ALUMNO</div>
        <img src="${dataUrl}" alt="QR"/>
        <div class="name">${name}</div>
        <div class="code">${code}</div>
      </div>
      <script>window.onload=function(){setTimeout(function(){window.print()},250)}</script>
      </body></html>`);
    w.document.close();
  };

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
      <Button variant="ghost" className="btn-sm" onClick={print} icon={<IconQr />} disabled={!dataUrl}>
        Imprimir carnet
      </Button>
    </div>
  );
}
