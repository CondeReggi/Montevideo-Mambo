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
  debtMoney: number;
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
export const seedHorarios = () => api<{ message: string }>("/api/dev/seed-horarios", { method: "POST" });

// ---- Admin ----
export interface StudentRow { id: string; fullName: string; email: string; phone: string | null; qrFixedCode: string; isActive: boolean; }
export interface TeacherRow { id: string; fullName: string; email: string; bio: string | null; isActive: boolean; }
export interface ClassRow {
  id: string; name: string; style: string; level: string; weekday: number;
  room: string | null; isActive: boolean;
  startTime: string; endTime: string; teachers: string[]; teacherIds: string[];
}

export const listStudents = () => api<StudentRow[]>("/api/admin/students");
export const listTeachers = () => api<TeacherRow[]>("/api/admin/teachers");
export const listClasses = () => api<ClassRow[]>("/api/admin/classes");

export const createStudent = (body: {
  fullName: string; email: string; password: string;
  documentId?: string; phone?: string; qrFixedCode?: string; photoPath?: string;
}) => api<{ id: string }>("/api/admin/students", { method: "POST", body: JSON.stringify(body) });

export const updateStudent = (id: string, body: {
  fullName: string; phone?: string; documentId?: string; notes?: string;
}) => api(`/api/admin/students/${id}`, { method: "PUT", body: JSON.stringify(body) });

export const setStudentActive = (id: string, active: boolean) =>
  api(`/api/admin/students/${id}/active`, { method: "POST", body: JSON.stringify({ active }) });

export const createClass = (body: {
  name: string; style: string; level: string; weekday: number;
  startTime: string; endTime: string; room?: string; teacherIds: string[];
}) => api<{ id: string }>("/api/admin/classes", { method: "POST", body: JSON.stringify(body) });

export const updateClass = (id: string, body: {
  name: string; style: string; level: string; weekday: number;
  startTime: string; endTime: string; room?: string; teacherIds: string[];
}) => api(`/api/admin/classes/${id}`, { method: "PUT", body: JSON.stringify(body) });

export const setClassActive = (id: string, active: boolean) =>
  api(`/api/admin/classes/${id}/active`, { method: "POST", body: JSON.stringify({ active }) });

export const ensureTodaySessions = () =>
  api<{ count: number }>("/api/sessions/ensure-today", { method: "POST" });

// ---- Profesores ----
export const createTeacher = (body: { fullName: string; email: string; password: string; bio?: string }) =>
  api<{ id: string }>("/api/admin/teachers", { method: "POST", body: JSON.stringify(body) });
export const updateTeacher = (id: string, body: { fullName: string; bio?: string }) =>
  api(`/api/admin/teachers/${id}`, { method: "PUT", body: JSON.stringify(body) });
export const setTeacherActive = (id: string, active: boolean) =>
  api(`/api/admin/teachers/${id}/active`, { method: "POST", body: JSON.stringify({ active }) });

// ---- Horarios públicos (grilla desde la BD) ----
export interface ScheduleItem {
  weekday: number; startTime: string; endTime: string; name: string; style: string; level: string;
}
export const getPublicSchedule = () => api<ScheduleItem[]>("/api/public/schedule");

// ---- Panel del alumno ----
export interface AlertItem { level: "critical" | "warn"; message: string; passId: string | null; }
export interface StudentPanel {
  summary: StudentSummary;
  passes: { id: string; kind: string; balance: number; initialCount: number | null; validFrom: string; validTo: string; status: string; isPaid: boolean; price: number; }[];
  history: { id: string; date: string; className: string; status: string; source: string; coveredByUnlimited: boolean; }[];
  payments: { id: string; amount: number; method: string; status: string; paidAt: string | null; concept: string | null; }[];
  alerts: AlertItem[];
}
export const getMyPanel = () => api<StudentPanel>("/api/me/panel");

// ---- Recordatorios / avisos ----
export interface StudentRisk { studentId: string; fullName: string; level: "critical" | "warn"; message: string; }
export interface OldPending {
  attendanceId: string; sessionId: string; studentId: string; studentName: string;
  className: string; endAt: string; level: "critical" | "warn";
}
export const getAdminAlerts = () =>
  api<{ studentsAtRisk: StudentRisk[]; oldPending: OldPending[] }>("/api/admin/alerts");
export const getOldPending = () => api<OldPending[]>("/api/sessions/pending-old");

// ---- QR del alumno (Modo A: muestro mi QR) y marcado por escaneo (Modo B) ----
export interface MyQr { qrFixedCode: string; fullName: string; }
export const getMyQr = () => api<MyQr>("/api/me/qr");

export interface ActiveClass {
  id: string; className: string; style: string; level: string; startAt: string; endAt: string;
}
export const getActiveClasses = () => api<ActiveClass[]>("/api/me/active-classes");
export const scanCheckIn = (token: string) =>
  api<CheckInResult>("/api/me/scan", { method: "POST", body: JSON.stringify({ token }) });

// ---- Pantalla de la academia (Modo B): QR dinámico por clase activa ----
export interface DisplaySession {
  id: string; className: string; style: string; level: string;
  startAt: string; endAt: string; token: string;
}
export interface DisplayActive { rotateInSeconds: number; sessions: DisplaySession[]; }
export const getDisplayActive = () => api<DisplayActive>("/api/display/active");

// ---- Cuponeras y pagos (admin) ----
export interface PassType {
  id: string; name: string; kind: string; classCount: number | null; price: number; validityDays: number;
}
export interface Debtor {
  studentId: string; fullName: string; debtClasses: number; pendingAttendances: number; classesRemaining: number; debtMoney: number;
}

export const getStudentDetail = (id: string) => api<StudentPanel>(`/api/admin/students/${id}`);
export const listPassTypes = () => api<PassType[]>("/api/admin/passtypes");

export const assignPass = (body: {
  studentId: string; passTypeId: string; registerPayment: boolean; paymentMethod?: string;
}) => api<{ id: string }>("/api/admin/passes", { method: "POST", body: JSON.stringify(body) });

export const extendPass = (passId: string, body: { extraDays: number; extraClasses: number; reason?: string }) =>
  api(`/api/admin/passes/${passId}/extend`, { method: "POST", body: JSON.stringify(body) });

export const payPass = (passId: string, method?: string) =>
  api<{ id: string }>(`/api/admin/passes/${passId}/pay`, { method: "POST", body: JSON.stringify({ method: method ?? null }) });

export const registerPayment = (body: {
  studentId: string; amount: number; method: string; concept?: string; passId?: string; confirmed: boolean;
}) => api<{ id: string }>("/api/admin/payments", { method: "POST", body: JSON.stringify(body) });

export const listDebtors = () => api<Debtor[]>("/api/admin/debtors");

export interface PendingPayment {
  id: string; studentId: string; fullName: string; amount: number;
  method: string; concept: string | null; createdAt: string;
}
export const listPendingPayments = () => api<PendingPayment[]>("/api/admin/payments/pending");
export const confirmPayment = (id: string) => api(`/api/admin/payments/${id}/confirm`, { method: "POST" });
export const cancelPayment = (id: string) => api(`/api/admin/payments/${id}/cancel`, { method: "POST" });

export const manualAttendance = (studentId: string) =>
  api<CheckInResult>("/api/admin/attendance/manual", { method: "POST", body: JSON.stringify({ studentId }) });
