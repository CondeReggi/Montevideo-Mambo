"use client";

import { useEffect, useRef } from "react";

interface Props {
  onScan: (text: string) => void;
  active: boolean;
}

/**
 * Escáner de QR por cámara (html5-qrcode). Carga dinámica para evitar SSR.
 * Modo primario: la recepción de la academia escanea el QR del alumno.
 *
 * Robustez: solo se detiene el escáner si REALMENTE está escaneando/pausado. Si la
 * cámara no llegó a abrir (permiso denegado, sin cámara), llamar a stop() lanza
 * "Cannot stop, scanner is not running or paused" de forma SINCRÓNICA y tumbaba la
 * app. Se envuelve todo en try/catch y se consulta getState() antes de parar.
 */
export default function QrScanner({ onScan, active }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // El callback en un ref: así el efecto NO se reinicia en cada render (antes, con
  // onScan inline, el escáner se re-montaba constantemente y disparaba stop() en mal momento).
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!active || !ref.current) return;
    let stopped = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let html5: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let States: any = null;

    (async () => {
      try {
        const mod = await import("html5-qrcode");
        States = mod.Html5QrcodeScannerState;
        const elId = "qr-reader-region";
        if (ref.current) ref.current.id = elId;
        html5 = new mod.Html5Qrcode(elId);
        if (stopped) return; // se desmontó mientras cargaba la librería
        await html5.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decoded: string) => { if (!stopped) onScanRef.current(decoded); },
          () => {},
        );
      } catch {
        /* permiso denegado / sin cámara: se ignora; el operador usa el ingreso manual */
      }
    })();

    return () => {
      stopped = true;
      if (!html5) return;
      try {
        const state = typeof html5.getState === "function" ? html5.getState() : null;
        const scanning = States && (state === States.SCANNING || state === States.PAUSED);
        if (scanning) {
          const p = html5.stop();
          if (p && typeof p.then === "function") p.then(() => html5.clear()).catch(() => {});
        } else if (typeof html5.clear === "function") {
          html5.clear();
        }
      } catch {
        /* ya estaba detenido / nunca arrancó: nada que hacer */
      }
    };
  }, [active]);

  return <div ref={ref} className="w-full max-w-xs mx-auto rounded-lg overflow-hidden" />;
}
