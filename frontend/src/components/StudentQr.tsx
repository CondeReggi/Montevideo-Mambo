"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { Button } from "@/components/ui";
import { IconQr } from "@/components/ui/Icons";

/**
 * Muestra el QR fijo del alumno (para que la recepción lo escanee) y un botón que
 * abre la PANTALLA de carnet (/carnet), una ruta propia a pantalla completa y
 * responsive con la card grande y la flecha para volver.
 */
export default function StudentQr({ code, name }: { code: string; name: string }) {
  const router = useRouter();
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

  const openCarnet = () =>
    router.push(`/carnet?code=${encodeURIComponent(code)}&name=${encodeURIComponent(name)}`);

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
        onClick={openCarnet}
        icon={<IconQr />}
        disabled={!code}
      >
        Ver / imprimir carnet
      </Button>
    </div>
  );
}
