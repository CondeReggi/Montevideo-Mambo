"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, Session } from "./auth";

/**
 * Hook de guardia: devuelve la sesión actual y redirige a /login si no hay,
 * o a la home si falta el rol requerido. `ready` evita parpadeos de contenido.
 */
export function useAuth(requiredRole?: string | string[]) {
  const router = useRouter();
  const [session, setSessionState] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const roleKey = Array.isArray(requiredRole) ? requiredRole.join(",") : requiredRole;

  useEffect(() => {
    const s = getSession();
    if (!s) {
      router.replace("/login");
      return;
    }
    const roles = Array.isArray(requiredRole) ? requiredRole : requiredRole ? [requiredRole] : [];
    if (roles.length > 0 && !roles.some((r) => s.roles.includes(r))) {
      router.replace("/");
      return;
    }
    setSessionState(s);
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, roleKey]);

  return { session, ready };
}
