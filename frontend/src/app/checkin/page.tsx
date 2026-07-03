"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { checkInByQr, CheckInResponse, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { Shell, PageHeader } from "@/components/ui/TopBar";
import { Button, Card, Spinner } from "@/components/ui";
import StudentCard from "@/components/StudentCard";
import { IconQr, IconCamera, IconCheck, IconAlert } from "@/components/ui/Icons";

const QrScanner = dynamic(() => import("@/components/QrScanner"), { ssr: false });

type Feedback =
  | { kind: "ok"; data: CheckInResponse }
  | { kind: "warn"; data: CheckInResponse }
  | { kind: "error"; message: string }
  | null;

export default function CheckInPage() {
  const { ready } = useAuth(["admin", "teacher"]); // recepción: profe o admin
  const [code, setCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const register = useCallback(
    async (qr: string) => {
      if (!qr || busy) return;
      setBusy(true);
      setFeedback(null);
      try {
        const data = await checkInByQr(qr);
        const kind = data.result.outOfWindow || data.result.isAmbiguous ? "warn" : "ok";
        setFeedback({ kind, data });
      } catch (e) {
        setFeedback({
          kind: "error",
          message: e instanceof ApiError ? e.message : "Error de conexión con el servidor.",
        });
      } finally {
        setBusy(false);
        setCode("");
      }
    },
    [busy],
  );

  if (!ready) return null;

  return (
    <Shell max="max-w-xl">
      <PageHeader
        eyebrow="Recepción"
        title="Check-in por QR"
        subtitle="Escaneá el QR del alumno. Se registra como pendiente; el profesor confirma luego."
      />

      <Card className="mb-5 p-5">
        <Button
          variant={scanning ? "ghost" : "primary"}
          className="w-full"
          icon={<IconCamera />}
          onClick={() => setScanning((s) => !s)}
        >
          {scanning ? "Detener cámara" : "Escanear con cámara"}
        </Button>
        {scanning && (
          <div className="mt-3 overflow-hidden rounded-xl border border-ink-500">
            <QrScanner active={scanning} onScan={register} />
          </div>
        )}

        <div className="mt-5">
          <label className="label">Ingreso manual del código</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-dim">
                <IconQr />
              </span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && register(code)}
                placeholder="Código del QR fijo (ej. STU-ANA-001)"
                className="field pl-9"
              />
            </div>
            <Button onClick={() => register(code)} disabled={busy || !code}>
              {busy ? <Spinner className="h-4 w-4" /> : "Registrar"}
            </Button>
          </div>
        </div>
      </Card>

      {feedback && <ResultCard feedback={feedback} />}
    </Shell>
  );
}

function ResultCard({ feedback }: { feedback: NonNullable<Feedback> }) {
  if (feedback.kind === "error") {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-red-500/40 bg-red-500/10 p-5 animate-fade-up">
        <span className="mt-0.5 text-xl text-red-400">
          <IconAlert />
        </span>
        <div>
          <p className="font-semibold text-red-300">No se pudo registrar</p>
          <p className="text-sm text-red-200/80">{feedback.message}</p>
        </div>
      </div>
    );
  }
  const { result, student } = feedback.data;
  const warn = feedback.kind === "warn";
  return (
    <Card
      className={`overflow-hidden p-0 animate-fade-up ${warn ? "border-amber-400/50" : "border-lime/50 shadow-glow-sm"}`}
    >
      <div className={`h-1.5 w-full ${warn ? "bg-amber-400" : "bg-lime-grad"}`} />
      <div className="p-5">
        <div className="mb-4 rounded-xl border border-ink-500/70 bg-ink-900/50 p-4">
          <StudentCard student={student} size="lg" />
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xl ${warn ? "text-amber-300" : "text-lime"}`}>
            {warn ? <IconAlert /> : <IconCheck />}
          </span>
          <p className={`font-display text-lg tracking-wide ${warn ? "text-amber-300" : "text-lime"}`}>
            {result.alreadyExisted
              ? "Ya estaba registrado"
              : warn
                ? "Registrado con observación"
                : "¡Asistencia registrada!"}
          </p>
        </div>
        <p className="mt-1 text-sm text-muted-soft">{result.message}</p>
      </div>
    </Card>
  );
}
