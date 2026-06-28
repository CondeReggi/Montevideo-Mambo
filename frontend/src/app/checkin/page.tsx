"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { checkInByQr, CheckInResult, ApiError } from "@/lib/api";

const QrScanner = dynamic(() => import("@/components/QrScanner"), { ssr: false });

type Feedback =
  | { kind: "ok"; result: CheckInResult }
  | { kind: "warn"; result: CheckInResult }
  | { kind: "error"; message: string }
  | null;

export default function CheckInPage() {
  const [code, setCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const register = useCallback(async (qr: string) => {
    if (!qr || busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await checkInByQr(qr);
      const kind = result.outOfWindow || result.isAmbiguous ? "warn" : "ok";
      setFeedback({ kind, result });
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Error de conexión con el servidor.";
      setFeedback({ kind: "error", message });
    } finally {
      setBusy(false);
      setCode("");
    }
  }, [busy]);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 p-6 flex flex-col items-center">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold mb-1">Check-in de asistencia</h1>
        <p className="text-sm text-slate-500 mb-6">
          La recepción escanea el QR del alumno. Se registra como <b>pendiente</b>; el profesor confirma luego.
        </p>

        <div className="bg-white rounded-xl shadow p-4 mb-4">
          <button
            onClick={() => setScanning((s) => !s)}
            className="w-full mb-3 rounded-lg bg-slate-900 text-white py-2 font-medium"
          >
            {scanning ? "Detener cámara" : "Escanear con cámara"}
          </button>
          {scanning && <QrScanner active={scanning} onScan={register} />}

          <div className="mt-4">
            <label className="text-sm text-slate-600">Ingreso manual del código</label>
            <div className="flex gap-2 mt-1">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && register(code)}
                placeholder="Código del QR fijo"
                className="flex-1 border rounded-lg px-3 py-2"
              />
              <button
                onClick={() => register(code)}
                disabled={busy || !code}
                className="rounded-lg bg-emerald-600 text-white px-4 py-2 font-medium disabled:opacity-50"
              >
                Registrar
              </button>
            </div>
          </div>
        </div>

        {feedback && <ResultCard feedback={feedback} />}
      </div>
    </main>
  );
}

function ResultCard({ feedback }: { feedback: NonNullable<Feedback> }) {
  if (feedback.kind === "error") {
    return (
      <div className="rounded-xl border-l-4 border-red-500 bg-red-50 p-4 text-red-800">
        <p className="font-semibold">No se pudo registrar</p>
        <p className="text-sm">{feedback.message}</p>
      </div>
    );
  }
  const { result } = feedback;
  const warn = feedback.kind === "warn";
  return (
    <div
      className={`rounded-xl border-l-4 p-4 ${
        warn ? "border-amber-500 bg-amber-50 text-amber-900" : "border-emerald-500 bg-emerald-50 text-emerald-900"
      }`}
    >
      <p className="font-semibold">
        {result.alreadyExisted ? "Ya estaba registrado" : warn ? "Registrado con observación" : "¡Asistencia registrada!"}
      </p>
      <p className="text-sm mt-1">{result.message}</p>
      {/* TODO: mostrar foto + nombre + saldo del alumno para verificación visual (endpoint pendiente). */}
    </div>
  );
}
