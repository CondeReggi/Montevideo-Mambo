# Análisis de Seguridad y Robustez — APP Montevideo MAMBO

> Fecha del análisis: **2026-07-10**
> Alcance: backend .NET 8 (`backend/`), frontend Next.js (`frontend/`), configuración y repositorio.
> Objetivo: listar todo lo que fallaría o sería explotable si esto fuera una **aplicación real en producción**.
> Estado: **documento de trabajo** — iremos resolviendo hallazgos uno a uno.

## Cómo leer este documento

Cada hallazgo tiene: **ID**, severidad, ubicación (`archivo:línea`), qué pasa, el impacto y la
recomendación. La severidad asume un despliegue **real, expuesto a internet** (no el modo demo local).

| Severidad | Significado |
|---|---|
| 🔴 **Crítica** | Compromiso total o robo de credenciales/datos con poco esfuerzo. Bloqueante para producción. |
| 🟠 **Alta** | Explotable con esfuerzo moderado o expone datos sensibles. Resolver antes de exponer. |
| 🟡 **Media** | Debilita la postura de seguridad o falla bajo abuso/escala. Resolver pronto. |
| 🔵 **Baja / Robustez** | Buenas prácticas, mantenibilidad y resiliencia operativa. |

### Resumen (tabla de control)

| ID | Sev | Título | Estado |
|---|---|---|---|
| SEC-01 | 🔴 | Clave de firma JWT insegura por defecto (fallback hardcodeado) | ✅ Resuelto (2026-07-10) |
| SEC-02 | 🔴 | `appsettings.Development.json` versionado con la clave JWT | ✅ Resuelto (2026-07-10) |
| SEC-03 | 🔴 | Base SQLite (`mambo_dev.db`) con hashes de contraseñas commiteada | Pendiente |
| SEC-04 | 🔴 | Secreto del QR (Modo B) reutiliza la clave JWT | ✅ Resuelto (2026-07-10) |
| SEC-05 | 🟠 | Sin HTTPS forzado / HSTS: tokens Bearer viajan en claro | ✅ Resuelto (2026-07-10) |
| SEC-06 | 🟠 | JWT guardado en `localStorage` (robo por XSS) | 🟡 Mitigado vía CSP (SEC-21); cookie HttpOnly pendiente |
| SEC-07 | 🟠 | Login sin rate limiting ni bloqueo por intentos (fuerza bruta) | ✅ Resuelto (2026-07-10) |
| SEC-08 | 🟠 | Sin revocación de tokens / logout de servidor / refresh | ✅ Resuelto (2026-07-10) |
| SEC-09 | 🟠 | `DevController` de seed depende solo de `IsDevelopment()` | ✅ Resuelto (2026-07-10) |
| SEC-10 | 🟡 | CORS y `AllowedHosts` permisivos / frágiles ante mala config | Pendiente |
| SEC-11 | 🟡 | Códigos QR fijos de alumno predecibles (`STU-ANA-001`) | Pendiente |
| SEC-12 | 🟡 | Sin validación de entrada (email, política de contraseña, longitudes) | Pendiente |
| SEC-13 | 🟡 | Fuga de detalles internos en mensajes de error (`ex.Message`) | Pendiente |
| SEC-14 | 🟡 | PBKDF2 con 100k iteraciones (por debajo de OWASP 2024) | Pendiente |
| SEC-15 | 🟡 | No existe flujo de cambio/reset de contraseña | Pendiente |
| SEC-16 | 🟡 | N+1 de consultas en listado de asistencias (DoS/performance) | Pendiente |
| SEC-17 | 🔵 | Sin middleware global de manejo de excepciones | Pendiente |
| SEC-18 | 🔵 | Sin auditoría de eventos de auth (logins fallidos/exitosos) | Pendiente |
| SEC-19 | 🔵 | Listados sin paginación (agotamiento de memoria a escala) | Pendiente |
| SEC-20 | 🔵 | Esquema por `EnsureCreated`, sin migraciones versionadas | Pendiente |
| SEC-21 | 🔵 | Sin cabeceras de seguridad HTTP ni límites de tamaño de payload | ✅ Resuelto (2026-07-10, CSP + headers) |
| SEC-22 | 🔵 | Connection string de Postgres con credenciales en el repo | ✅ Resuelto (2026-07-10) |

---

## 🔴 Críticas

### SEC-01 — Clave de firma JWT insegura por defecto (fallback hardcodeado)
- **Ubicación:** `backend/src/Mambo.Api/Program.cs:26`, `backend/src/Mambo.Infrastructure/Services/JwtIssuer.cs:16`
- **Qué pasa:** ambos lugares usan
  `config["Jwt:Key"] ?? "dev-only-insecure-key-change-me-please-32+chars"`.
  Si en producción falta `Jwt:Key` (variable de entorno no seteada, typo, config no cargada),
  el sistema **arranca igual** firmando y validando tokens con una clave **pública conocida**.
- **Impacto:** un atacante puede **forjar un JWT con `role=admin`** y controlar toda la aplicación
  (crear/editar alumnos, pagos, cuponeras, asistencias). Compromiso total.
- **Recomendación:**
  1. Eliminar el fallback. Si falta `Jwt:Key`, **fallar el arranque** (`throw`) en producción.
  2. Exigir longitud mínima (≥ 32 bytes) y cargar la clave desde variable de entorno / secret manager.
  3. Centralizar la lectura de la clave (hoy está duplicada en dos archivos que podrían divergir).
- **✅ Resolución (2026-07-10):** se agregó `ResolveSecret(...)` en `Program.cs`: exige longitud
  mínima de 32 caracteres y, si el secreto falta, usa un fallback **solo en Development**; en cualquier
  otro entorno **lanza y detiene el arranque**. La clave se resuelve una única vez y se comparte con el
  emisor vía el nuevo `JwtOptions` (`JwtIssuer.cs`), que ya **no relee config ni tiene fallback**.
  Verificado: prod sin secreto → aborta con mensaje claro; prod con secreto → arranca; dev → login OK.

### SEC-02 — `appsettings.Development.json` versionado con la clave JWT
- **Ubicación:** `backend/src/Mambo.Api/appsettings.Development.json:16`, `.gitignore` (la excluye a propósito: `# appsettings.Development.json se versiona`)
- **Qué pasa:** el archivo commiteado incluye `Jwt:Key = "dev-local-secret-key-please-change-me-32chars-min"`.
- **Impacto:** cualquiera con acceso al repo conoce la clave de desarrollo. Si ese entorno queda
  expuesto (o la clave se reusa), se pueden **forjar tokens**. Además normaliza el antipatrón de
  “commitear secretos”.
- **Recomendación:** no versionar claves de firma ni siquiera de dev. Usar **User Secrets** de .NET
  (`dotnet user-secrets`) o variables de entorno. Dejar en el repo solo un `appsettings.Development.json.example`
  con valores vacíos/placeholder.
- **✅ Resolución (2026-07-10):** se quitó `Jwt:Key` de `appsettings.Development.json` (quedan solo
  `Issuer`/`Audience`/`ExpiresHours`, que no son secretos). El dev funciona por el fallback solo-dev del
  código. **Nota pendiente menor:** la clave dev anterior aún vive en el historial de git; como era un
  placeholder de desarrollo ya reemplazado y sin uso, purgar el historial es opcional (los secretos de
  producción nunca se commitearon: `appsettings.json` los tiene vacíos).

### SEC-03 — Base SQLite (`mambo_dev.db`) con hashes de contraseñas commiteada
- **Ubicación:** repositorio — `git ls-files` lista `backend/src/Mambo.Api/mambo_dev.db` (+ `-shm`, `-wal`)
- **Qué pasa:** el binario SQLite de desarrollo está **bajo control de versiones** y contiene la tabla
  `app_user` con `password_hash`, emails y estructura completa.
- **Impacto:** filtración de estructura y de hashes (aunque hoy sean de usuarios demo). El riesgo real
  es que este archivo se **reutilice/prometa** con datos reales, o que los hashes demo se craqueen y
  esas contraseñas se reusen. Un `.db` binario además ensucia diffs e historial.
- **Recomendación:** dejar de trackear el archivo (`git rm --cached mambo_dev.db*`), agregar
  `*.db`, `*.db-shm`, `*.db-wal` al `.gitignore`, y **purgar del historial** si alguna vez contuvo datos
  reales (git filter-repo / BFG). El esquema ya se regenera solo con `EnsureCreated`.

### SEC-04 — Secreto del QR (Modo B) reutiliza la clave JWT
- **Ubicación:** `backend/src/Mambo.Infrastructure/DependencyInjection.cs:56`
- **Qué pasa:** `var qrSecret = config["Qr:Secret"] ?? config["Jwt:Key"] ?? throw ...`. Si no se define
  `Qr:Secret`, el HMAC de los tokens de asistencia se firma con **la misma clave** que los JWT de sesión.
- **Impacto:** **reutilización de secreto entre dos dominios de confianza distintos**. Filtrar/rotar uno
  obliga a rotar el otro; una debilidad en un flujo compromete al otro. Mala separación de secretos.
- **Recomendación:** exigir un `Qr:Secret` propio e independiente (fallar si falta en producción), o
  derivar claves separadas por propósito (p. ej. HKDF con etiquetas distintas) a partir de una raíz.
- **✅ Resolución (2026-07-10):** se eliminó el `?? config["Jwt:Key"]` de `DependencyInjection.cs`. El
  `Qr:Secret` ahora se resuelve en `Program.cs` con el **mismo fail-fast** que el JWT y un fallback
  solo-dev **distinto** al del JWT, de modo que nunca se reutiliza un secreto entre ambos dominios.

---

## 🟠 Altas

### SEC-05 — Sin HTTPS forzado / HSTS: tokens Bearer viajan en claro
- **Ubicación:** `backend/src/Mambo.Api/Program.cs` (no hay `UseHttpsRedirection`, `UseHsts`, ni `RequireHttps`)
- **Qué pasa:** el pipeline no fuerza TLS. El backend en Render escucha por HTTP (`http://0.0.0.0:{PORT}`).
- **Impacto:** si el TLS no lo termina un proxy delante **de forma estricta**, credenciales y JWT viajan
  en texto plano → interceptables (MITM en redes de la academia/WiFi). El JWT robado da acceso por 12h.
- **Recomendación:** terminar TLS en el borde y, en la app, `app.UseHsts()` + `UseHttpsRedirection()` en
  producción; marcar cookies (si se migra a cookies) como `Secure`.
- **✅ Resolución (2026-07-10):** se agregó `UseForwardedHeaders` (X-Forwarded-Proto/For) para que la app
  conozca el esquema/IP reales detrás del proxy de Render, y `UseHsts()` en producción. **No** se usó
  `UseHttpsRedirection` a propósito: Render ya fuerza HTTPS en el borde, y un redirect a nivel app
  arriesga romper el health-check interno (HTTP) y generar bucles tras el proxy. Los forwarded headers
  además habilitan el rate limiting por IP real (SEC-07).

### SEC-06 — JWT guardado en `localStorage` (robo por XSS)
- **Ubicación:** `frontend/src/lib/auth.ts:17-38` (`localStorage.setItem("mambo.session", ...)`)
- **Qué pasa:** el token se guarda en `localStorage`, accesible por cualquier JavaScript de la página.
- **Impacto:** una única vulnerabilidad **XSS** (o una dependencia npm comprometida) permite **exfiltrar
  el JWT** y suplantar al usuario. `localStorage` no ofrece `HttpOnly`.
- **Recomendación:** preferir **cookie `HttpOnly` + `Secure` + `SameSite=Strict/Lax`** emitida por el
  backend. Si se mantiene el patrón SPA con Bearer, minimizar superficie XSS (CSP estricta, sanitización)
  y acortar la vida del token. Ver SEC-08 (rotación) y SEC-21 (CSP).
- **🟡 Mitigación (2026-07-10):** en lugar de migrar a cookie (complejo y riesgoso por ser **cross-site**:
  front en Vercel, back en Render → requeriría `SameSite=None` + CSRF), se optó por **reducir el vector
  de robo**: **CSP estricta con nonce** (ver SEC-21) que impide ejecutar scripts inyectados por XSS, más
  el hecho de que el access token ya es **corto (30 min)** tras SEC-08. El token sigue en `localStorage`,
  así que **SEC-06 queda parcialmente abierto**: la migración a cookie `HttpOnly` es la solución completa
  y se recomienda hacerla cuando el front y el back compartan un **dominio propio** (cookies same-site,
  mucho más simple y seguro).

### SEC-07 — Login sin rate limiting ni bloqueo por intentos (fuerza bruta)
- **Ubicación:** `backend/src/Mambo.Api/Controllers/AuthController.cs:14`, `AuthService.cs:12`
- **Qué pasa:** `/api/auth/login` no tiene límite de tasa, ni backoff, ni bloqueo temporal de cuenta/IP.
- **Impacto:** **fuerza bruta / credential stuffing** ilimitado contra contraseñas. Con contraseñas
  débiles (no hay política, ver SEC-12) es cuestión de tiempo.
- **Recomendación:** aplicar **Rate Limiting** de ASP.NET Core (`AddRateLimiter`, política por IP y por
  email) en login; bloqueo temporal tras N fallos; considerar CAPTCHA tras varios intentos. Registrar
  intentos fallidos (SEC-18).
- **✅ Resolución (2026-07-10):** `AddRateLimiter` con política `"auth"` (ventana fija por IP:
  **20 intentos / 5 min**, excedente → **429**) aplicada a `POST /api/auth/login` vía
  `[EnableRateLimiting("auth")]`. Verificado: los intentos por encima del límite devuelven 429.
  Se eligió 20 (no 10) por la IP compartida del wifi de la academia. **Mejora futura:** sumar
  partición/bloqueo por cuenta (email) y registro de intentos fallidos (SEC-18).

### SEC-08 — Sin revocación de tokens / logout de servidor / refresh
- **Ubicación:** `JwtIssuer.cs` (JWT stateless, 12h), no hay lista de revocación ni refresh tokens
- **Qué pasa:** un JWT emitido es válido 12h y **no se puede invalidar**. “Cerrar sesión” solo borra el
  token del cliente; el token sigue siendo válido si fue copiado. Dar de baja un usuario (`IsActive=false`)
  **no invalida** su token vigente.
- **Impacto:** un token robado o el de un usuario dado de baja/comprometido **sigue funcionando hasta 12h**.
- **Recomendación:** access tokens **cortos** (5–15 min) + **refresh token** rotatorio persistido/revocable;
  o lista de revocación (jti en caché/BD). Verificar `IsActive` del usuario en cada request sensible.
- **✅ Resolución (2026-07-10):** se implementó **refresh token completo**:
  - Access JWT corto (`Jwt:AccessMinutes`, por defecto **30 min**) + refresh token opaco largo
    (`Jwt:RefreshDays`, por defecto **30 días**), guardado en BD **solo como hash SHA-256**
    (nueva tabla `refresh_token`; entidad EF + `db/migrations/007_refresh_token.sql`).
  - Endpoints nuevos: `POST /api/auth/refresh` (rota el token: revoca el usado y emite uno nuevo)
    y `POST /api/auth/logout` (revoca; idempotente).
  - **Rotación con detección de reuso:** si llega un refresh ya rotado, se revoca **toda la cadena**
    del usuario (mitiga robo). Se verifica `IsActive` en cada refresh (⇒ un usuario dado de baja
    pierde acceso en ≤30 min, ya no en 12 h).
  - Frontend: manejo global de 401 en `api.ts` con **single-flight refresh** + reintento; si el
    refresh también falla → limpia sesión y redirige a `/login` (ver más abajo). Logout revoca en
    el server antes de limpiar el cliente.
  - Verificado E2E: login/refresh/rotación/reuso/logout/idempotencia/token inválido → todos con el
    código HTTP esperado (401, no 500).
  - **Nota:** el refresh token se guarda en `localStorage` (consistente con el esquema actual). Pasar
    ambos tokens a cookie `HttpOnly` queda cubierto por **SEC-06** (pendiente).

### SEC-09 — `DevController` de seed depende solo de `IsDevelopment()`
- **Ubicación:** `backend/src/Mambo.Api/Controllers/DevController.cs:10-31`
- **Qué pasa:** `[AllowAnonymous]` + chequeo `if (!env.IsDevelopment()) return NotFound()`. La barrera es
  **una sola variable de entorno** (`ASPNETCORE_ENVIRONMENT`).
- **Impacto:** si por error se despliega con `ASPNETCORE_ENVIRONMENT=Development` (o no se setea y toma un
  default equivocado), cualquiera puede llamar **anónimamente** a `/api/dev/seed` y crear usuarios
  **admin con contraseñas conocidas** (`Admin1234!`) → compromiso total.
- **Recomendación:** excluir por completo el controller del build de producción (compilación condicional
  `#if DEBUG` o registrar el endpoint solo si `IsDevelopment()`), no depender de un `return NotFound()`
  en runtime. Nunca sembrar credenciales fijas en un entorno alcanzable.
- **✅ Resolución (2026-07-10):** `DevController` quedó envuelto en `#if DEBUG`. El Dockerfile publica en
  **Release**, así que en producción la clase **no existe** en el binario (el endpoint `/api/dev/*` es
  inalcanzable, no depende de `ASPNETCORE_ENVIRONMENT`). Se mantiene el chequeo `IsDevelopment()` como
  segunda barrera para builds Debug. Verificado: en dev (Debug) el seed sigue respondiendo 200.

---

## 🟡 Medias

### SEC-10 — CORS y `AllowedHosts` permisivos / frágiles
- **Ubicación:** `Program.cs:51-53` (CORS), `appsettings.json:8` (`"AllowedHosts": "*"`)
- **Qué pasa:** CORS usa `AllowAnyHeader().AllowAnyMethod()` con orígenes desde config; si `Cors:Origins`
  se configura mal (vacío, o incluye comodines) la política queda demasiado abierta. `AllowedHosts:"*"`
  acepta cualquier Host header.
- **Impacto:** orígenes no confiables podrían interactuar con la API; `Host` header spoofing.
- **Recomendación:** lista blanca **explícita** de orígenes de producción; no permitir `*`; fijar
  `AllowedHosts` a los dominios reales. Revisar que no se combine `AllowCredentials` con orígenes amplios.

### SEC-11 — Códigos QR fijos de alumno predecibles
- **Ubicación:** `DevSeeder.cs:28-29` (`STU-ANA-001`, `STU-LEO-002`), usado en `CheckInController` / `MeController:37`
- **Qué pasa:** el `QrFixedCode` (Modo A) parece **secuencial/adivinable**. El check-in por QR requiere
  rol Teacher/Admin, pero el identificador en sí no es un secreto.
- **Impacto:** si el flujo evoluciona (o se expone), un código predecible permite **registrar asistencia a
  nombre de otro alumno** o enumerar alumnos. Riesgo de suplantación en el proceso físico.
- **Recomendación:** generar `QrFixedCode` con **aleatoriedad criptográfica** (p. ej. 128 bits base32),
  no derivado del nombre ni secuencial. Tratarlo como identificador opaco.

### SEC-12 — Sin validación de entrada (email, contraseña, longitudes)
- **Ubicación:** `AdminService.cs:225-236` (`CreateUserAsync`), records `CreateStudentInput`/`CreateTeacherInput`
- **Qué pasa:** no se valida formato de email, **no hay política de complejidad/longitud de contraseña**,
  ni límites de longitud en `FullName`, `Phone`, etc. Solo se chequea email duplicado.
- **Impacto:** contraseñas triviales (agravado por SEC-07), datos basura, posible abuso de almacenamiento,
  y errores de integridad. Base para fuerza bruta exitosa.
- **Recomendación:** DataAnnotations / FluentValidation: email válido, contraseña mínima (≥12, con
  requisitos o verificación contra listas de comunes), límites de longitud, `[ApiController]` ya valida
  ModelState pero faltan las reglas.

### SEC-13 — Fuga de detalles internos en mensajes de error
- **Ubicación:** múltiples controllers: `AdminController`, `MeController:84`, `AttendanceController`, etc.
  (`catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }`)
- **Qué pasa:** se devuelve `ex.Message` directo al cliente. Hoy son mensajes de negocio, pero el patrón
  puede **filtrar detalles internos** si se lanza desde capas más profundas.
- **Impacto:** divulgación de información (nombres de entidades, lógica) útil para un atacante.
- **Recomendación:** separar mensajes de negocio “seguros” (whitelist) de errores internos; loguear el
  detalle del lado servidor y devolver mensajes genéricos/códigos al cliente.

### SEC-14 — PBKDF2 con 100.000 iteraciones (por debajo de la guía OWASP)
- **Ubicación:** `backend/src/Mambo.Infrastructure/Services/Pbkdf2PasswordHasher.cs:11`
- **Qué pasa:** `Iterations = 100_000` con PBKDF2-SHA256. OWASP (2023+) recomienda **≥ 600.000** para
  PBKDF2-SHA256, o preferir **Argon2id**.
- **Impacto:** hashes más baratos de craquear offline si la BD se filtra.
- **Recomendación:** subir a ≥ 600k, o migrar a **Argon2id** (`Konscious.Security.Cryptography`). La verificación
  ya lee el nº de iteraciones del hash, así que se puede **re-hashear al vuelo** en el próximo login.

### SEC-15 — No existe flujo de cambio/reset de contraseña
- **Ubicación:** no hay endpoint de `change-password` / `reset-password` (revisado en todos los controllers)
- **Qué pasa:** el usuario **no puede cambiar su contraseña** ni recuperarla; el admin edita datos “sin tocar
  email ni contraseña” (`AdminService.cs:76`).
- **Impacto:** ante sospecha de compromiso no hay forma de rotar credenciales. Gap funcional de seguridad.
- **Recomendación:** endpoint de cambio de contraseña (exigiendo la actual) y flujo de reset con token de
  un solo uso y expiración. Invalidar sesiones al cambiar (ver SEC-08).

### SEC-16 — N+1 de consultas en listado de asistencias
- **Ubicación:** `backend/src/Mambo.Api/Controllers/SessionsController.cs:70-80`
- **Qué pasa:** por cada asistencia se hace `await summaries.GetAsync(r.StudentId, ...)` dentro de un `foreach`,
  y cada `GetAsync` puede además pedir una **signed URL** a Supabase Storage por HTTP.
- **Impacto:** con muchas asistencias, decenas/cientos de round-trips a BD **y** a Storage por request →
  latencia alta y **DoS** trivial por amplificación.
- **Recomendación:** cargar los resúmenes en **una sola consulta** (join/`IN`), y batch/caché de signed URLs.

---

## 🔵 Bajas / Robustez de producción

### SEC-17 — Sin middleware global de manejo de excepciones
- **Ubicación:** `Program.cs` (no hay `UseExceptionHandler` ni `ProblemDetails`)
- **Impacto:** excepciones no controladas → 500 sin formato consistente; en Development pueden exponer
  stack traces. Respuestas de error no uniformes para el frontend.
- **Recomendación:** `AddProblemDetails()` + `UseExceptionHandler` con respuesta genérica en producción y
  logging estructurado del detalle.

### SEC-18 — Sin auditoría de eventos de autenticación
- **Ubicación:** `AuthService.cs` (login no registra nada); `audit_log` solo cubre acciones de negocio
- **Impacto:** imposible detectar fuerza bruta, accesos anómalos o investigar incidentes.
- **Recomendación:** registrar login exitoso/fallido (email, IP, user-agent, timestamp) y accesos a datos
  sensibles. Alertar sobre patrones (muchos fallos).

### SEC-19 — Listados sin paginación
- **Ubicación:** `AdminController` (`ListStudents`, `ListTeachers`, `ListClasses`), `BillingService` (debtors/pending)
- **Impacto:** a escala, cargar todo en memoria y enviarlo en un JSON gigante degrada/derriba el servicio.
- **Recomendación:** paginación (`skip`/`take` o keyset) y límites por defecto en todas las listas.

### SEC-20 — Esquema por `EnsureCreated`, sin migraciones versionadas
- **Ubicación:** `Program.cs:58-63` (SQLite `EnsureCreated`); el esquema Postgres vive en SQL suelto en `db/`
- **Impacto:** deriva entre el modelo EF y el SQL de `db/`; cambios de esquema no reproducibles ni versionados
  para el runtime .NET.
- **Recomendación:** adoptar **EF Core Migrations** como fuente de verdad (o mantener disciplina estricta de
  sincronización), y no usar `EnsureCreated` en entornos que evolucionan.

### SEC-21 — Sin cabeceras de seguridad HTTP ni límites de payload
- **Ubicación:** `Program.cs` (no hay CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`; sin límite explícito de tamaño de body)
- **Impacto:** frontend sin **CSP** amplifica el riesgo de XSS (relacionado con SEC-06); sin límites de body,
  payloads enormes pueden abusar recursos.
- **Recomendación:** añadir cabeceras de seguridad (middleware o en el proxy), CSP estricta en el frontend,
  y `MaxRequestBodySize` razonable.
- **✅ Resolución (2026-07-10):** nuevo `frontend/src/middleware.ts` que emite una **CSP estricta con
  nonce por request** (`script-src 'self' 'nonce-…' 'strict-dynamic'`, sin `'unsafe-inline'` para
  scripts) + `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `X-Frame-Options: DENY`, `Permissions-Policy` (cámara solo self) y `frame-ancestors 'none'`. El nonce
  se aplica al script inline de PWA (`layout.tsx`) y Next.js lo propaga a sus propios scripts.
  Verificado: la cabecera CSP trae nonce, 15/15 `<script>` lo llevan (la app hidrata) y un script
  inyectado sin nonce quedaría bloqueado. `connect-src`/`img-src` se arman desde `NEXT_PUBLIC_API_URL` y
  `NEXT_PUBLIC_SUPABASE_URL` (ver nota de despliegue). **Pendiente menor:** `MaxRequestBodySize` en el
  backend .NET (Kestrel ya trae un límite por defecto de 30 MB).

### SEC-22 — Connection string de Postgres con credenciales en el repo
- **Ubicación:** `appsettings.Development.json:13` (`...Username=postgres;Password=postgres`)
- **Impacto:** aunque es local/Docker, normaliza credenciales en el repo y puede reutilizarse por error.
- **Recomendación:** credenciales fuera del repo (env / user-secrets); en Docker, variables del compose.
- **✅ Resolución (2026-07-10):** se quitó la connection string `Supabase` de `appsettings.Development.json`.
  Ahora el Postgres local de Docker es un **fallback solo-dev** dentro de `DependencyInjection.cs`; en
  producción, si falta la cadena por env, el arranque **falla** (ya no hay credenciales en el repo).

---

## Plan de remediación sugerido (orden propuesto)

1. **Secretos y arranque seguro (SEC-01, SEC-02, SEC-04, SEC-22):** quitar fallbacks, sacar secretos del
   repo, fallar el arranque si faltan, secretos separados por propósito.
2. **Repositorio limpio (SEC-03):** destrackear `*.db*`, ajustar `.gitignore`, evaluar purga de historial.
3. **Transporte y sesión (SEC-05, SEC-06, SEC-08):** HTTPS/HSTS, mover token a cookie HttpOnly, tokens
   cortos + refresh/revocación.
4. **Superficie de ataque de auth (SEC-07, SEC-09, SEC-12, SEC-14, SEC-15):** rate limiting, blindar el
   seed de producción, validación de entrada, reforzar hashing, flujo de contraseña.
5. **Endurecimiento (SEC-10, SEC-11, SEC-13, SEC-17, SEC-18, SEC-21):** CORS/headers, QR aleatorio, errores
   genéricos, auditoría de auth, cabeceras de seguridad.
6. **Escala y robustez (SEC-16, SEC-19, SEC-20):** eliminar N+1, paginación, migraciones.

> Cuando resolvamos cada hallazgo, actualizar la columna **Estado** de la tabla de control y dejar la
> entrada correspondiente en `NOTAS_CAMBIOS.txt` (según la convención del proyecto).
