# Análisis de Rendimiento — APP Montevideo MAMBO

> Fecha: **2026-07-11**
> Alcance: frontend (Next.js/Vercel), backend (.NET/Render), base (Supabase) e infraestructura.
> Objetivo: listar por qué la app se siente lenta y dejar un **to-do priorizado** de mejoras.
> Estado: **documento de trabajo** — iremos resolviendo y marcando la columna Estado.

## Cómo leer

Cada ítem tiene: **ID**, impacto, ubicación (`archivo:línea`), qué pasa y la recomendación. El
"impacto" es cuánto se nota en la experiencia real (app en Render free + Supabase + Vercel).

| Impacto | Significado |
|---|---|
| 🔴 **Alto** | Se siente claramente. Atacar primero. |
| 🟠 **Medio** | Suma latencia perceptible bajo uso normal. |
| 🔵 **Bajo/Afinado** | Buenas prácticas y micro-optimizaciones. |

### To-do (tabla de control)

| ID | Impacto | Título | Estado |
|---|---|---|---|
| PERF-01 | 🔴 | Render **free**: cold starts (~30–60 s) + 0.1 vCPU / 512 MB | Pendiente |
| PERF-02 | 🔴 | N+1 en `sessions/{id}/attendances` (resumen + signed URL por fila) | Pendiente |
| PERF-03 | 🔴 | La CSP con nonce volvió **todas** las rutas dinámicas (regresión) | Pendiente |
| PERF-04 | 🟠 | `StudentSummaryService`: ~5 queries + 1 HTTP por llamada | Pendiente |
| PERF-05 | 🟠 | Signed URLs de fotos sin caché (HTTP a Supabase por foto/render) | Pendiente |
| PERF-06 | 🟠 | Listados sin paginación (students, classes, debtors, payments) | Pendiente |
| PERF-07 | 🟠 | Dashboard admin: 5 requests; alerts/debtors recalculan sin caché | Pendiente |
| PERF-08 | 🟠 | `StudentPanelService` consulta `passes` dos veces | Pendiente |
| PERF-09 | 🟠 | Sin caché en memoria de datos casi estáticos (passtypes, schedule) | Pendiente |
| PERF-10 | 🟠 | Fetch-on-mount en cada pantalla (sin SSR/prefetch ni caché) | Pendiente |
| PERF-11 | 🔵 | Falta `AsNoTracking` en queries con `Include` (login, admin) | Pendiente |
| PERF-12 | 🔵 | Supabase free: latencia/conexiones; falta pooling explícito | Pendiente |
| PERF-13 | 🔵 | Backend sin compresión de respuestas (gzip/brotli) | Pendiente |
| PERF-14 | 🔵 | Saldo/deuda recalculado por request en varios paths | Pendiente |
| PERF-15 | 🔵 | Sin `Cache-Control` en respuestas cacheables (schedule público) | Pendiente |
| PERF-16 | 🔵 | Middleware CSP corre en cada navegación (nonce) | Pendiente |

---

## 🔴 Alto impacto

### PERF-01 — Render free: cold starts + recursos mínimos
- **Ubicación:** `render.yaml:8` (`plan: free`)
- **Qué pasa:** en el plan **free**, el servicio se **apaga tras ~15 min sin tráfico**; la siguiente
  request tiene que **arrancar el contenedor .NET en frío (~30–60 s)**. Además el plan free da
  ~0.1 vCPU y 512 MB, así que aún "caliente" responde lento bajo cualquier carga.
- **Por qué se siente:** es casi seguro **la causa #1 de la lentitud intermitente** ("a veces tarda
  un montón, otras va bien"). El primer login/panel del día o después de un rato de inactividad pega
  el cold start completo (backend + primera conexión a Supabase).
- **Recomendación (en orden de costo/beneficio):**
  1. **Keep-alive**: un ping periódico a `/health` (cron cada ~10 min) para que no se duerma. Barato
     y elimina la mayoría de los cold starts. (Se puede con un cron gratuito externo o un GitHub Action.)
  2. Subir a un **plan pago de Render** (starter) → sin spin-down y más CPU/RAM.
  3. Optimizar el arranque .NET (ReadyToRun/AOT) para que el cold start sea más corto.

### PERF-02 — N+1 en el listado de asistencias de una sesión
- **Ubicación:** `backend/src/Mambo.Api/Controllers/SessionsController.cs:70-80`
- **Qué pasa:** por **cada** asistencia se llama `summaries.GetAsync(studentId)` dentro de un `foreach`;
  y **cada** `GetAsync` hace ~5 queries **y** una llamada HTTP a Supabase Storage (signed URL). Para
  una clase con 20 alumnos → **~100 queries + 20 HTTP** en una sola request. (Es el mismo hallazgo
  SEC-16.)
- **Por qué se siente:** la pantalla "Clases de hoy → asistencias" y el check-in se vuelven lentos a
  medida que crece la clase, y encima cada request mantiene ocupado el poco CPU del plan free.
- **Recomendación:** traer los resúmenes de todos los alumnos de la sesión en **1–2 queries** (join /
  `IN (...)`), y resolver las fotos en lote (ver PERF-05). Idealmente un método
  `GetSummariesAsync(IEnumerable<Guid> studentIds)` que agregue por grupo.

### PERF-03 — La CSP con nonce volvió todas las rutas dinámicas (regresión propia)
- **Ubicación:** `frontend/src/middleware.ts` + `frontend/src/app/layout.tsx` (lee `headers()`)
- **Qué pasa:** para aplicar el nonce de CSP (SEC-21) el layout raíz lee `headers()`, lo que **saca a
  TODAS las páginas del renderizado estático**: en el build pasaron de `○ (Static)` a `ƒ (Dynamic)`.
  Las páginas públicas (`/`, `/horarios`, `/login`), que antes se servían **cacheadas por CDN**, ahora
  se **renderizan por request** en Vercel (peor TTFB, más invocaciones serverless).
- **Por qué se siente:** la primera carga de las páginas públicas y la navegación quedaron algo más
  lentas de lo que eran antes del cambio de seguridad.
- **Recomendación (elegir una):**
  1. **Mantener el nonce solo en el área autenticada** y servir las páginas públicas como estáticas con
     una **CSP estática** (sin nonce) vía `next.config` headers. Mejor equilibrio.
  2. Pasar toda la CSP a `next.config` **estática** (sin nonce; usar hash del script inline de PWA +
     `'strict-dynamic'`), aceptando `'unsafe-inline'` de fallback → CSP algo más débil pero rutas
     estáticas de nuevo.
  3. Aceptar el estado actual (dinámico) si se prioriza la CSP estricta; documentar el trade-off.
  > Nota: es un trade-off **seguridad ↔ rendimiento** que introdujo el endurecimiento; conviene
  > decidirlo explícitamente.

---

## 🟠 Medio impacto

### PERF-04 — `StudentSummaryService` hace muchas idas a la BD por llamada
- **Ubicación:** `backend/src/Mambo.Application/UseCases/StudentSummaryService.cs:26-64`
- **Qué pasa:** por alumno: query de datos, query de passes, `CountAsync` de no-cubiertas, `CountAsync`
  de pendientes, **+ 1 HTTP** de signed URL. Son ~5 round-trips por alumno. Aceptable para 1 alumno,
  caro cuando se llama en loop (PERF-02) o muy seguido.
- **Recomendación:** combinar los conteos en menos queries (o subconsultas), y exponer una variante
  batch por lista de `studentId`. Marcar las queries de solo-lectura con `AsNoTracking` (PERF-11).

### PERF-05 — Signed URLs de fotos sin caché
- **Ubicación:** `backend/src/Mambo.Infrastructure/Services/SupabasePhotoStorage.cs:18-42`
- **Qué pasa:** cada `GetReadSignedUrlAsync` es un **POST HTTP a Supabase Storage**. Se llama por foto
  por render (y N veces en listados). La URL firmada dura 300 s pero **no se reutiliza**.
- **Recomendación:** cachear la signed URL por `photoPath` en memoria (`IMemoryCache`) durante ~la
  mitad del TTL. Elimina casi todos los round-trips de fotos. (Ataca también PERF-02.)

### PERF-06 — Listados sin paginación
- **Ubicación:** `AdminController` (`ListStudents`, `ListTeachers`, `ListClasses`), `BillingService`
  (`ListDebtorsAsync`, `ListPendingPaymentsAsync`) — traen **todo** sin `Skip/Take`.
- **Qué pasa:** hoy con pocos datos no molesta, pero crece lineal con alumnos/pagos y transfiere JSON
  grande. (Mismo hallazgo SEC-19.)
- **Recomendación:** paginación (`skip`/`take` o keyset) + límite por defecto; búsqueda server-side en
  Alumnos.

### PERF-07 — Dashboard admin: 5 requests y recálculo sin caché
- **Ubicación:** `frontend/src/app/admin/page.tsx:47-55` (5 llamadas), `AlertsService`, `BillingService.ListDebtorsAsync`
- **Qué pasa:** al entrar al panel se disparan **5 requests** en paralelo; `debtors` y `alerts`
  recorren/recalculan datos de todos los alumnos **en cada carga**, sin caché.
- **Recomendación:** un endpoint agregado `GET /api/admin/dashboard` que devuelva todo junto en 1
  request; cachear (in-memory, ~30–60 s) debtors/alerts que no cambian a cada segundo.

### PERF-08 — `StudentPanelService` consulta `passes` dos veces
- **Ubicación:** `backend/src/Mambo.Application/UseCases/StudentPanelService.cs:19` y `:25-32`
  (`summaries.GetAsync` ya trae passes; el panel los vuelve a traer)
- **Recomendación:** compartir el resultado de passes entre summary y panel (pasarlo por parámetro o
  unificar la consulta).

### PERF-09 — Sin caché de datos casi estáticos
- **Ubicación:** `PublicController.Schedule` (grilla), `BillingService.ListPassTypesAsync` (catálogo)
- **Qué pasa:** la grilla pública y el catálogo de cuponeras cambian **muy poco**, pero se consultan a
  la BD en cada request.
- **Recomendación:** `IMemoryCache` con expiración corta (minutos) e invalidación al editar. La grilla
  pública además puede llevar `Cache-Control` (PERF-15).

### PERF-10 — Fetch-on-mount en cada pantalla
- **Ubicación:** patrón general del frontend (p. ej. `admin/page.tsx`, `me/page.tsx` con `useEffect(load)`)
- **Qué pasa:** cada pantalla monta, muestra skeleton y **recién ahí** pide datos al backend. Sin SSR
  ni prefetch ni caché de respuestas; agravado por el cold start del backend (PERF-01).
- **Recomendación:** prefetch/caché ligera de respuestas (SWR/React Query o un caché propio en memoria
  con revalidación), y prefetch de rutas al pasar el dedo/hover sobre los accesos.

---

## 🔵 Bajo / afinado

### PERF-11 — Falta `AsNoTracking` en queries con `Include`
- **Ubicación:** `AuthService` (login con `Include`), `AdminService`. (La mayoría de los reads usan
  `.Select(...)` proyectado, que ya no trackea; el impacto es menor.)
- **Recomendación:** `AsNoTracking()` en lecturas con `Include`.

### PERF-12 — Supabase free: latencia y conexiones
- **Qué pasa:** plan free con límites de conexiones/compute; cada instancia .NET abre su pool. Sin
  pgBouncer/pooler explícito.
- **Recomendación:** usar el **connection pooler** de Supabase (puerto 6543) en la cadena de conexión,
  y verificar que backend y Supabase estén en regiones cercanas.

### PERF-13 — Sin compresión de respuestas
- **Ubicación:** `Program.cs` (no hay `AddResponseCompression`)
- **Recomendación:** `app.UseResponseCompression()` (gzip/brotli) para los JSON de listados.

### PERF-14 — Saldo/deuda recalculado por request
- **Ubicación:** `StudentSummaryService`, `BillingService` (se recalcula en varios paths)
- **Recomendación:** aprovechar el caché desnormalizado `pass.balance` y, en Postgres, las vistas/
  triggers de `db/`; evitar recomputar lo mismo varias veces por request.

### PERF-15 — Sin `Cache-Control` en respuestas cacheables
- **Ubicación:** `PublicController.Schedule`
- **Recomendación:** `Cache-Control: public, max-age=...` en la grilla pública (y en Vercel/CDN por
  delante) para no pegarle a la BD por cada visitante de `/horarios`.

### PERF-16 — Middleware CSP en cada navegación
- **Ubicación:** `frontend/src/middleware.ts` (matcher amplio)
- **Qué pasa:** genera un nonce por request; costo mínimo pero corre en cada ruta que matchea.
- **Recomendación:** si se resuelve PERF-03, ajustar el matcher para no correr donde no aporta.

---

## Plan sugerido (orden por costo/beneficio)

1. **PERF-01 (keep-alive del backend)** — el cambio de una línea de mayor impacto: elimina la mayoría
   de los cold starts. Empezar por acá.
2. **PERF-05 + PERF-02** — cachear signed URLs y matar el N+1 de asistencias: la pantalla más pesada.
3. **PERF-03** — decidir el trade-off CSP↔estático y recuperar cacheo de las páginas públicas.
4. **PERF-07 + PERF-09** — endpoint de dashboard agregado + caché de datos casi estáticos.
5. **PERF-06 + PERF-10** — paginación y caché/prefetch en el frontend.
6. Afinado: PERF-11/12/13/14/15/16.

> Al resolver cada ítem, actualizar la columna **Estado** y dejar la entrada en `NOTAS_CAMBIOS.txt`.
