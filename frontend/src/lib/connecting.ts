// Estado global de "conectando…": se enciende cuando alguna petición al backend
// tarda más de un umbral (por defecto 3s), para dar feedback en los cold starts de
// Render sin parpadear en las peticiones rápidas. Store mínimo con suscripción para
// useSyncExternalStore.

let slowCount = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function subscribeConnecting(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** true si hay al menos una petición que ya pasó el umbral de lentitud. */
export function isConnecting(): boolean {
  return slowCount > 0;
}

/**
 * Marca una promesa como potencialmente lenta: si no termina antes de `delayMs`,
 * enciende el indicador global hasta que resuelva (o falle). Devuelve la MISMA
 * promesa para poder encadenarla sin cambiar el flujo.
 */
export function trackSlow<T>(op: Promise<T>, delayMs = 3000): Promise<T> {
  let marked = false;
  const timer = setTimeout(() => {
    marked = true;
    slowCount++;
    emit();
  }, delayMs);

  return op.finally(() => {
    clearTimeout(timer);
    if (marked) {
      slowCount = Math.max(0, slowCount - 1);
      emit();
    }
  });
}
