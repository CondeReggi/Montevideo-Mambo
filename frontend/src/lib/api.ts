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

// ---- Tipos ----
export interface StudentSummary {
  studentId: string;
  fullName: string;
  photoUrl: string | null;
  classesRemaining: number;
  hasActiveUnlimited: boolean;
  debtClasses: number;
  pendingAttendances: number;
}

export interface CheckInResult {
  attendanceId: string;
  studentId: string;
  status: number;
  isAmbiguous: boolean;
  outOfWindow: boolean;
  alreadyExisted: boolean;
  message: string;
}

export interface CheckInResponse {
  result: CheckInResult;
  student: StudentSummary | null;
}

export interface SessionToday {
  id: string;
  status: string;
  startAt: string;
  endAt: string;
  className: string;
  style: string;
  level: string;
  pendingCount: number;
  confirmedCount: number;
}

export interface SessionAttendance {
  id: string;
  studentId: string;
  status: string;
  source: string;
  checkedInAt: string;
  isAmbiguous: boolean;
  student: StudentSummary | null;
}

// ---- Endpoints ----
export const checkInByQr = (qrCode: string) =>
  api<CheckInResponse>("/api/checkin/qr", {
    method: "POST",
    body: JSON.stringify({ qrCode }),
  });

export const getTodaySessions = () => api<SessionToday[]>("/api/sessions/today");

export const getSessionAttendances = (sessionId: string, onlyPending = true) =>
  api<SessionAttendance[]>(`/api/sessions/${sessionId}/attendances?onlyPending=${onlyPending}`);

export const confirmAttendance = (id: string) =>
  api(`/api/attendance/${id}/confirm`, { method: "POST" });

export const confirmMany = (attendanceIds: string[]) =>
  api(`/api/attendance/confirm-many`, {
    method: "POST",
    body: JSON.stringify({ attendanceIds }),
  });

export const rejectAttendance = (id: string, reason?: string) =>
  api(`/api/attendance/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) });

export const correctAttendance = (id: string, reason?: string) =>
  api(`/api/attendance/${id}/correct`, { method: "POST", body: JSON.stringify({ reason }) });
