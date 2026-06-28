"use client";

import { useEffect, useRef } from "react";

interface Props {
  onScan: (text: string) => void;
  active: boolean;
}

/**
 * Escáner de QR por cámara (html5-qrcode). Carga dinámica para evitar SSR.
 * Modo primario: la recepción de la academia escanea el QR del alumno.
 */
export default function QrScanner({ onScan, active }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<unknown>(null);

  useEffect(() => {
    if (!active || !ref.current) return;
    let stopped = false;
    let instance: { stop: () => Promise<void>; clear: () => void } | null = null;

    (async () => {
      const { Html5Qrcode } = await import("html5-qrcode");
      const elId = "qr-reader-region";
      if (ref.current) ref.current.id = elId;
      const html5 = new Html5Qrcode(elId);
      scannerRef.current = html5;
      instance = html5 as unknown as typeof instance;
      try {
        await html5.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decoded) => {
            if (!stopped) onScan(decoded);
          },
          () => {}
        );
      } catch {
        /* permiso de cámara denegado: el operador usa el ingreso manual */
      }
    })();

    return () => {
      stopped = true;
      if (instance) {
        instance.stop().then(() => instance?.clear()).catch(() => {});
      }
    };
  }, [active, onScan]);

  return <div ref={ref} className="w-full max-w-xs mx-auto rounded-lg overflow-hidden" />;
}
