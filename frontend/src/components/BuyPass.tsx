"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getCheckoutAvailability, listMyPassTypes, listMyCheckouts, startCheckout,
  PassType, CheckoutIntent, ApiError,
} from "@/lib/api";
import { Card, Button, Badge, Skeleton } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { IconCash } from "@/components/ui/Icons";
import { kindLabel, fmtDate } from "@/components/format";

/**
 * Compra de cuponeras con Mercado Pago.
 *
 * Si la pasarela todavía no está configurada (faltan las credenciales), el backend
 * responde enabled:false y acá se muestra el cartel de "próximamente" en vez del
 * botón de comprar. La integración queda hecha: alcanza con cargar la credencial.
 */
export default function BuyPass({ onPurchased }: { onPurchased?: () => void }) {
  const toast = useToast();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [types, setTypes] = useState<PassType[]>([]);
  const [intents, setIntents] = useState<CheckoutIntent[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    getCheckoutAvailability()
      .then((r) => {
        setEnabled(r.enabled);
        if (!r.enabled) return;
        listMyPassTypes().then(setTypes).catch(() => setTypes([]));
        listMyCheckouts().then(setIntents).catch(() => setIntents([]));
      })
      .catch(() => setEnabled(false));
  }, []);

  useEffect(load, [load]);

  // El alumno vuelve de Mercado Pago con ?compra=... Se avisa y se recarga el panel:
  // la cuponera la entrega el webhook, así que puede tardar unos segundos en aparecer.
  useEffect(() => {
    const compra = new URLSearchParams(window.location.search).get("compra");
    if (!compra) return;

    if (compra === "ok") toast.success("¡Pago recibido! Tu cuponera se acredita en unos segundos.");
    else if (compra === "pendiente") toast.info("Tu pago quedó pendiente de acreditación.");
    else if (compra === "error") toast.error("El pago no se pudo completar.");

    window.history.replaceState({}, "", window.location.pathname);
    onPurchased?.();
    load();
  }, [toast, onPurchased, load]);

  const buy = async (t: PassType) => {
    setBusyId(t.id);
    try {
      // Solo se manda el id: el precio lo pone el backend.
      const { initPoint } = await startCheckout(t.id);
      window.location.href = initPoint;
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo iniciar el pago.");
      setBusyId(null);
    }
  };

  if (enabled === null) return <Skeleton className="h-32" />;

  if (!enabled) {
    return (
      <Card className="p-5 animate-fade-up">
        <h2 className="mb-1 flex items-center gap-2 font-semibold">
          <span className="text-lime"><IconCash /></span> Comprar cuponera
        </h2>
        <div className="mt-3 rounded-lg border border-sky-400/30 bg-sky-400/10 p-4">
          <p className="text-sm font-medium text-sky-200">Próximamente: Mercado Pago</p>
          <p className="mt-1 text-sm text-muted">
            Vas a poder comprar tus cuponeras desde acá. Por ahora, consultá en recepción.
          </p>
        </div>
      </Card>
    );
  }

  const pendiente = intents.find((i) => i.status === "Pending");

  return (
    <Card className="p-5 animate-fade-up">
      <h2 className="mb-1 flex items-center gap-2 font-semibold">
        <span className="text-lime"><IconCash /></span> Comprar cuponera
      </h2>
      <p className="mb-4 text-sm text-muted">Pagás con Mercado Pago y se acredita sola.</p>

      {pendiente && (
        <div className="mb-4 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3">
          <p className="text-sm text-amber-200">
            Tenés un pago en curso de {pendiente.passTypeName} (${pendiente.amount}). Si ya pagaste,
            se acredita en unos minutos.
          </p>
        </div>
      )}

      {types.length === 0 ? (
        <p className="text-sm text-muted">No hay cuponeras disponibles.</p>
      ) : (
        <div className="grid grid-cols-1 gap-2">
          {types.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-ink-500/60 p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{t.name}</p>
                <p className="text-xs text-muted">
                  {kindLabel(t.kind)}
                  {t.classCount ? ` · ${t.classCount} clases` : ""} · {t.validityDays} días
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="font-display text-lg text-lime">${t.price}</span>
                <Button className="!h-9 px-4 text-sm" onClick={() => buy(t)} disabled={busyId !== null}>
                  {busyId === t.id ? "Abriendo…" : "Comprar"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {intents.length > 0 && (
        <div className="mt-4 border-t border-ink-500/50 pt-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-soft">Mis compras</p>
          <div className="divide-y divide-ink-500/50">
            {intents.slice(0, 3).map((i) => (
              <div key={i.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm">{i.passTypeName}</p>
                  <p className="text-xs text-muted">{fmtDate(i.createdAt)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-sm text-muted">${i.amount}</span>
                  <CheckoutBadge status={i.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function CheckoutBadge({ status }: { status: CheckoutIntent["status"] }) {
  if (status === "Approved") return <Badge tone="lime">Acreditada</Badge>;
  if (status === "Pending") return <Badge tone="amber">Pendiente</Badge>;
  if (status === "Rejected") return <Badge tone="red">Rechazado</Badge>;
  return <Badge>Cancelado</Badge>;
}
