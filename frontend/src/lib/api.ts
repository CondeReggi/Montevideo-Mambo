import { getToken } from "./auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5080";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Llama al backend .NET adjuntando el JWT de sesión como Bearer. */
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
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

// ---- Auth ----
export interface LoginResult {
  token: string;
  expiresAt: string;
  userId: string;
  fullName: string;
  email: string;
  roles: string[];
  studentId: string | null;
  teacherId: string | null;
}
export const login = (email: string, password: string) =>
  api<LoginResult>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });

export const seedDemo = () => api<{ message: string }>("/api/dev/seed", { method: "POST" });

// ---- Admin ----
export interface StudentRow { id: string; fullName: string; email: string; qrFixedCode: string; isActive: boolean; }
export interface TeacherRow { id: string; fullName: string; email: string; isActive: boolean; }
export interface ClassRow {
  id: string; name: string; style: string; level: string; weekday: number;
  startTime: string; endTime: string; teachers: string[];
}

export const listStudents = () => api<StudentRow[]>("/api/admin/students");
export const listTeachers = () => api<TeacherRow[]>("/api/admin/teachers");
export const listClasses = () => api<ClassRow[]>("/api/admin/classes");

export const createStudent = (body: {
  fullName: string; email: string; password: string;
  documentId?: string; phone?: string; qrFixedCode?: string; photoPath?: string;
}) => api<{ id: string }>("/api/admin/students", { method: "POST", body: JSON.stringify(body) });

export const createClass = (body: {
  name: string; style: string; level: string; weekday: number;
  startTime: string; endTime: string; room?: string; teacherIds: string[];
}) => api<{ id: string }>("/api/admin/classes", { method: "POST", body: JSON.stringify(body) });

// ---- Panel del alumno ----
export interface StudentPanel {
  summary: StudentSummary;
  passes: { id: string; kind: string; balance: number; initialCount: number | null; validFrom: string; validTo: string; status: string; isPaid: boolean; }[];
  history: { id: string; date: string; className: string; status: string; source: string; coveredByUnlimited: boolean; }[];
  payments: { id: string; amount: number; method: string; status: string; paidAt: string | null; concept: string | null; }[];
}
export const getMyPanel = () => api<StudentPanel>("/api/me/panel");
