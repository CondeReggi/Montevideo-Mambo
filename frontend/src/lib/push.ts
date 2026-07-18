// Suscripción a notificaciones push (Web Push) desde el navegador.
// Flujo: registrar el SW -> pedir permiso -> suscribir con la clave pública VAPID
// del backend -> mandar el endpoint+claves al backend. Todo lo sensible (a quién y
// qué se envía) lo decide el backend; acá solo se gestiona el permiso del dispositivo.

import { getVapidKey, subscribePush, unsubscribePush } from "@/lib/api";

export type PushState = "unsupported" | "denied" | "disabled" | "on" | "off";

/** ¿El navegador soporta push? (iOS solo con la PWA instalada / iOS 16.4+). */
export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

// La clave VAPID viaja en base64url; PushManager la necesita como bytes.
// Se asienta sobre un ArrayBuffer explícito (compatibilidad de tipos con BufferSource).
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const buffer = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  // El SW se registra en ServiceWorkerRegister; esperamos a que esté listo.
  return navigator.serviceWorker.ready;
}

/** Estado actual: si el backend lo tiene habilitado y si este dispositivo ya está suscripto. */
export async function currentPushState(): Promise<{ state: PushState; enabled: boolean }> {
  if (!pushSupported()) return { state: "unsupported", enabled: false };

  let enabled = false;
  try {
    enabled = (await getVapidKey()).enabled;
  } catch {
    enabled = false;
  }
  if (!enabled) return { state: "disabled", enabled: false };
  if (Notification.permission === "denied") return { state: "denied", enabled: true };

  try {
    const reg = await getRegistration();
    const sub = await reg.pushManager.getSubscription();
    return { state: sub ? "on" : "off", enabled: true };
  } catch {
    return { state: "off", enabled: true };
  }
}

/** Activa las notificaciones en este dispositivo. Devuelve true si quedó suscripto. */
export async function enablePush(): Promise<boolean> {
  if (!pushSupported()) throw new Error("Este navegador no soporta notificaciones.");

  const info = await getVapidKey();
  if (!info.enabled || !info.publicKey)
    throw new Error("Las notificaciones todavía no están disponibles.");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Permiso de notificaciones denegado.");

  const reg = await getRegistration();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(info.publicKey) as BufferSource,
    });
  }

  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth)
    throw new Error("No se pudo obtener la suscripción del navegador.");

  await subscribePush({
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  });
  return true;
}

/** Desactiva las notificaciones en este dispositivo (borra la suscripción local y en el backend). */
export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  const reg = await getRegistration();
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => {});
  await unsubscribePush(endpoint).catch(() => {});
}
