// Sesión propia basada en el JWT del backend (guardada en localStorage).
// Diseñado para reemplazarse por Supabase Auth más adelante sin tocar las vistas.

export interface Session {
  token: string;
  expiresAt: string;
  userId: string;
  fullName: string;
  email: string;
  roles: string[];
  studentId: string | null;
  teacherId: string | null;
}

const KEY = "mambo.session";

export function setSession(s: Session) {
  if (typeof window !== "undefined") localStorage.setItem(KEY, JSON.stringify(s));
}

export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function clearSession() {
  if (typeof window !== "undefined") localStorage.removeItem(KEY);
}

export function getToken(): string | null {
  return getSession()?.token ?? null;
}

export function hasRole(role: string): boolean {
  return getSession()?.roles.includes(role) ?? false;
}
