"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type Handler = () => void | Promise<void>;

interface RefreshApi {
  register: (h: Handler) => () => void;
  refreshAll: () => Promise<void>;
}

const RefreshContext = createContext<RefreshApi | null>(null);

/** Provee el registro de "recargadores" de datos por pantalla + el disparador global. */
export function RefreshProvider({ children }: { children: React.ReactNode }) {
  const handlers = useRef<Set<Handler>>(new Set());

  const register = useCallback((h: Handler) => {
    handlers.current.add(h);
    return () => {
      handlers.current.delete(h);
    };
  }, []);

  const refreshAll = useCallback(async () => {
    const hs = Array.from(handlers.current);
    await Promise.all(
      hs.map((h) => {
        try {
          return Promise.resolve(h());
        } catch {
          return Promise.resolve();
        }
      }),
    );
    // Un mínimo para que el spinner se perciba aunque la data venga instantánea.
    await new Promise((r) => setTimeout(r, 250));
  }, []);

  return <RefreshContext.Provider value={{ register, refreshAll }}>{children}</RefreshContext.Provider>;
}

function useRefresh(): RefreshApi {
  const c = useContext(RefreshContext);
  if (!c) throw new Error("useRefresh debe usarse dentro de <RefreshProvider>.");
  return c;
}

/** Cada pantalla llama esto con su función de recarga; se dispara al hacer pull-to-refresh. */
export function useRegisterRefresh(fn: Handler) {
  const { register } = useRefresh();
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => register(() => ref.current()), [register]);
}

/**
 * Gesto de "tirar para actualizar" (pull-to-refresh) para móvil/PWA.
 * Se activa sólo cuando la página está arriba de todo. Muestra un spinner que baja con el
 * dedo; al soltar pasado el umbral, ejecuta refreshAll() (los recargadores registrados).
 */
export function PullToRefresh() {
  const { refreshAll } = useRefresh();
  const [dist, setDist] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const startY = useRef(0);
  const active = useRef(false);
  const distRef = useRef(0);
  const busyRef = useRef(false);
  const THRESHOLD = 72;
  const MAX = 96;

  useEffect(() => {
    const setD = (v: number) => {
      distRef.current = v;
      setDist(v);
    };
    const onStart = (e: TouchEvent) => {
      if (busyRef.current) return;
      // Sólo si estamos arriba de todo y es un único dedo.
      if (window.scrollY <= 0 && e.touches.length === 1) {
        startY.current = e.touches[0].clientY;
        active.current = true;
      } else {
        active.current = false;
      }
    };
    const onMove = (e: TouchEvent) => {
      if (!active.current || busyRef.current) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy > 0 && window.scrollY <= 0) {
        // Resistencia: cuesta más a medida que se estira.
        setD(Math.min(dy * 0.5, MAX));
      } else {
        active.current = false;
        setD(0);
      }
    };
    const onEnd = async () => {
      if (!active.current) return;
      active.current = false;
      if (distRef.current >= THRESHOLD && !busyRef.current) {
        busyRef.current = true;
        setRefreshing(true);
        setD(THRESHOLD);
        try {
          await refreshAll();
        } finally {
          busyRef.current = false;
          setRefreshing(false);
          setD(0);
        }
      } else {
        setD(0);
      }
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [refreshAll]);

  const visible = dist > 0 || refreshing;
  const progress = Math.min(dist / THRESHOLD, 1);

  return (
    <div
      aria-hidden={!visible}
      className="pointer-events-none fixed left-1/2 top-0 z-[60] -translate-x-1/2"
      style={{
        transform: `translate(-50%, ${(refreshing ? THRESHOLD : dist) - 44}px)`,
        opacity: visible ? 1 : 0,
        transition: active.current ? "none" : "transform 200ms ease, opacity 200ms ease",
      }}
    >
      <div className="grid h-10 w-10 place-items-center rounded-full border border-ink-500 bg-ink-800 shadow-panel">
        <span
          className={`inline-block h-5 w-5 rounded-full border-2 border-lime border-t-transparent ${
            refreshing ? "animate-spin-slow" : ""
          }`}
          style={{ transform: refreshing ? undefined : `rotate(${progress * 270}deg)`, opacity: 0.4 + progress * 0.6 }}
        />
      </div>
    </div>
  );
}
