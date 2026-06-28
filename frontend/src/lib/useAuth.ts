"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, Session } from "./auth";

/**
 * Hook de guardia: devuelve la sesión actual y redirige a /login si no hay,
 * o a la home si falta el rol requerido. `ready` evita parpadeos de contenido.
 */
export function useAuth(requiredRole?: string) {
  const router = useRouter();
  const [session, setSessionState] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const s = getSession();
    if (!s) {
      router.replace("/login");
      return;
    }
    if (requiredRole && !s.roles.includes(requiredRole)) {
      router.replace("/");
      return;
    }
    setSessionState(s);
    setReady(true);
  }, [router, requiredRole]);

  return { session, ready };
}
