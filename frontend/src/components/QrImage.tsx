"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** Renderiza un QR (PNG data URL) a partir de un texto arbitrario. Offline. */
export default function QrImage({ value, size = 320, className = "" }: { value: string; size?: number; className?: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!value) return;
    QRCode.toDataURL(value, {
      width: size * 2,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#0B0B0C", light: "#FFFFFF" },
    })
      .then(setUrl)
      .catch(() => setUrl(""));
  }, [value, size]);

  // Responsive: ocupa el ancho disponible hasta `size` (no desborda en pantallas chicas).
  if (!url)
    return <div style={{ maxWidth: size }} className={`aspect-square w-full animate-pulse rounded-2xl bg-white/10 ${className}`} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="QR" className={`aspect-square w-full rounded-2xl ${className}`} style={{ maxWidth: size }} />;
}
