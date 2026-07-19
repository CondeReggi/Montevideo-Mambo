import { getToken, getSession, getRefreshToken, updateTokens, clearSession } from "./auth";
import { trackSlow } from "./connecting";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5080";

// Endpoints de auth: un 401 acá NO debe disparar refresh (evita bucles).
const AUTH_PATHS = ["/api/auth/login", "/api/auth/refresh", "/api/auth/logout"];

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function rawFetch(path: string, options: RequestInit): Promise<Response> {
  const token = getToken();
  return fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
}

// Renovación con "single-flight": varias llamadas que reciben 401 a la vez
// comparten un único intento de refresh en lugar de dispararlo N veces.
let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(`${API_URL}/api/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) return false;
        const data = await res.json();
        updateTokens(data.token, data.expiresAt, data.refreshToken, data.refreshExpiresAt);
        return true;
      } catch {
        return false;
      } finally {
        // Liberar en el próximo tick para que las llamadas concurrentes reusen este intento.
        setTimeout(() => (refreshPromise = null), 0);
      }
    })();
  }
  return refreshPromise;
}

/** Sesión inválida/expirada sin posibilidad de renovar → limpiar y volver a login. */
function forceLogout() {
  clearSession();
  if (typeof window !== "undefined" && window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
}

/** Cierra la sesión: revoca el refresh token en el backend (best-effort) y limpia el cliente. */
export async function endSession(): Promise<void> {
  const refreshToken = getSession()?.refreshToken;
  if (refreshToken) {
    try {
      await trackSlow(fetch(`${API_URL}/api/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      }));
    } catch {
      /* best-effort: aunque falle, igual limpiamos localmente */
    }
  }
  clearSession();
}

/** Llama al backend .NET adjuntando el JWT de sesión como Bearer. */
export function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  // Envuelve la llamada en el rastreador de lentitud: si tarda +3s (cold start),
  // se enciende el indicador global "Conectando…".
  return trackSlow(apiInner<T>(path, options));
}

async function apiInner<T>(path: string, options: RequestInit): Promise<T> {
  let res = await rawFetch(path, options);

  // 401 en un endpoint normal → intentar renovar una vez y reintentar.
  if (res.status === 401 && !AUTH_PATHS.some((p) => path.startsWith(p))) {
    const renewed = await tryRefresh();
    if (!renewed) {
      forceLogout();
      throw new ApiError(401, "Tu sesión expiró. Iniciá sesión de nuevo.");
    }
    res = await rawFetch(path, options);
    if (res.status === 401) {
      forceLogout();
      throw new ApiError(401, "Tu sesión expiró. Iniciá sesión de nuevo.");
    }
  }

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
  refreshToken: string;
  refreshExpiresAt: string;
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
  // Estado de la asistencia del alumno en esta clase: null = todavía no marcó.
  myStatus: string | null;
}
export const getActiveClasses = () => api<ActiveClass[]>("/api/me/active-classes");
export const scanCheckIn = (token: string) =>
  api<CheckInResult>("/api/me/scan", { method: "POST", body: JSON.stringify({ token }) });

// Marcado SIMULADO (solo usuarios demo @mambo.local): salta el escaneo del QR.
export const scanDemoCheckIn = (sessionId: string) =>
  api<CheckInResult>("/api/me/scan-demo", { method: "POST", body: JSON.stringify({ sessionId }) });

// ---- Pantalla de la academia (Modo B): QR dinámico por clase activa ----
export interface DisplaySession {
  id: string; className: string; style: string; level: string;
  startAt: string; endAt: string; token: string;
}
export interface DisplayActive { rotateInSeconds: number; sessions: DisplaySession[]; }
export const getDisplayActive = () => api<DisplayActive>("/api/display/active");

// ---- Compra de cuponeras por Mercado Pago (alumno) ----
// El alumno solo elige QUÉ comprar (passTypeId): el precio lo pone el backend desde el
// catálogo. Nunca se manda un importe desde acá.
export interface CheckoutIntent {
  id: string; status: "Pending" | "Approved" | "Rejected" | "Cancelled";
  amount: number; passTypeName: string; failureReason: string | null; createdAt: string;
}

export const getCheckoutAvailability = () => api<{ enabled: boolean }>("/api/checkout/availability");
export const listMyPassTypes = () => api<PassType[]>("/api/me/passtypes");
export const listMyCheckouts = () => api<CheckoutIntent[]>("/api/me/checkout");

export const startCheckout = (passTypeId: string) =>
  api<{ intentId: string; initPoint: string }>("/api/me/checkout", {
    method: "POST", body: JSON.stringify({ passTypeId }),
  });

// ---- Contenidos (noticias, novedades, muestras, talleres, eventos) ----
// Tipos válidos (coinciden con el enum del backend):
export type ContentType = "News" | "Update" | "Showcase" | "Workshop" | "Event";

export interface Content {
  id: string;
  type: ContentType;
  title: string;
  body: string | null;
  imageUrl: string | null;
  eventDate: string | null;
  externalUrl: string | null;
  locationName: string | null;
  locationAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  isPublished: boolean;
  createdAt: string;
}

// Cuerpo de alta/edición. imagePath opcional (ruta en Storage; null = no cambiar).
export interface ContentInput {
  type: ContentType;
  title: string;
  body?: string | null;
  imagePath?: string | null;
  eventDate?: string | null;
  externalUrl?: string | null;
  locationName?: string | null;
  locationAddress?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  isPublished: boolean;
}

// Público / alumno: solo lo publicado.
export const listPublishedContent = (type?: ContentType) =>
  api<Content[]>(`/api/public/content${type ? `?type=${type}` : ""}`);

// Admin: CRUD completo (incluye borradores).
export const listAdminContent = () => api<Content[]>("/api/admin/content");
export const createContent = (body: ContentInput) =>
  api<{ id: string }>("/api/admin/content", { method: "POST", body: JSON.stringify(body) });
export const updateContent = (id: string, body: ContentInput) =>
  api(`/api/admin/content/${id}`, { method: "PUT", body: JSON.stringify(body) });
export const setContentPublished = (id: string, published: boolean) =>
  api(`/api/admin/content/${id}/published`, { method: "POST", body: JSON.stringify({ published }) });
export const deleteContent = (id: string) =>
  api(`/api/admin/content/${id}`, { method: "DELETE" });

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

// ---- Notificaciones push (Web Push) --------------------------------------
export interface VapidInfo {
  enabled: boolean;
  publicKey: string | null;
}
export const getVapidKey = () => api<VapidInfo>("/api/push/vapid-public-key");

export const subscribePush = (body: { endpoint: string; keys: { p256dh: string; auth: string } }) =>
  api("/api/push/subscribe", { method: "POST", body: JSON.stringify(body) });

export const unsubscribePush = (endpoint: string) =>
  api("/api/push/unsubscribe", { method: "POST", body: JSON.stringify({ endpoint }) });

export const testPush = () => api<{ sent: number }>("/api/push/test", { method: "POST" });

export const broadcastPush = (body: { title: string; body: string; url?: string; target?: string }) =>
  api<{ sent: number }>("/api/admin/push/broadcast", { method: "POST", body: JSON.stringify(body) });
