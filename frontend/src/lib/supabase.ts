import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

let client: SupabaseClient | null = null;

/**
 * Cliente de Supabase para el navegador (lazy: se crea al primer uso, no al
 * importar, para no romper el prerender cuando faltan las variables de entorno).
 * Se usa solo para autenticación; la lógica de negocio pasa por el backend .NET.
 */
export function getSupabase(): SupabaseClient {
  if (!client) {
    // Fallback inocuo para que createClient no falle en build sin envs.
    client = createClient(url || "http://localhost:54321", anonKey || "public-anon-key", {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return client;
}

/** Devuelve el access_token (JWT) de la sesión actual, o null. */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await getSupabase().auth.getSession();
  return data.session?.access_token ?? null;
}
