import { getAccessToken } from "./supabase";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5080";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Llama al backend .NET adjuntando el JWT de Supabase como Bearer. */
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  if (!res.ok) {
    let msg = `Error ${res.status}`;
    try {
      const body = await res.json();
      msg = body.error ?? msg;
    } catch {
      /* sin cuerpo JSON */
    }
    throw new ApiError(res.status, msg);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ---- Tipos de respuesta del backend ----
export interface CheckInResult {
  attendanceId: string;
  status: number;
  isAmbiguous: boolean;
  outOfWindow: boolean;
  alreadyExisted: boolean;
  message: string;
}

// ---- Endpoints ----
export const checkInByQr = (qrCode: string) =>
  api<CheckInResult>("/api/checkin/qr", {
    method: "POST",
    body: JSON.stringify({ qrCode }),
  });
