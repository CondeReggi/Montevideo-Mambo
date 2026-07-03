# CLAUDE.md

Guía para Claude Code al trabajar en este proyecto. Léela antes de proponer cambios.

## Qué es este proyecto

**APP Montevideo MAMBO** — Sistema de gestión integral para una academia de baile: alumnos,
profesores, clases, asistencia por QR, cuponeras, pagos y deudas. App web responsive, preparada
para PWA/app nativa a futuro.

**Estado actual: EN DESARROLLO.** Las tres capas existen y compilan/corren (ver `NOTAS_CAMBIOS.txt`).
Backend .NET 8 en capas (12 tests verdes), frontend Next.js 14 con identidad de marca aplicada, y
`db/` con el SQL de Supabase. El flujo de asistencia y la gestión de cuponeras/pagos funcionan E2E
en local (modo SQLite). Antes de cambios grandes, leer la bitácora y dejar una entrada datada.

## Stack objetivo (cuando se implemente)

- **Frontend:** React / Next.js (responsive + PWA).
- **Backend:** .NET 8 Web API — es la **única autoridad de escritura de negocio**.
- **Base de datos:** Supabase PostgreSQL.
- **Storage:** Supabase Storage (fotos de alumnos, QR imprimibles) — buckets privados + signed URLs.
- **Auth (actual):** autenticación propia con JWT en .NET (PBKDF2 + `password_hash`), para poder
  desarrollar/probar local antes de Supabase. Decisión [D15]. Roles de negocio en tablas propias.
  **A futuro:** integrar Supabase Auth (la validación por issuer es configurable). El diseño original
  (Supabase Auth) sigue documentado en `docs/03-...` como objetivo.
- **Correr local:** ver `RUN_LOCAL.md`. Dos opciones de BD ([D17]): **SQLite sin
  Docker** (modo por defecto en `appsettings.Development.json`,
  `Database:Provider=Sqlite`; esquema por `EnsureCreated`) o **Postgres en Docker**
  (`Database:Provider=Npgsql`, usa el SQL de `db/`). Backend `dotnet run` + frontend
  `npm run dev`. Usuarios demo vía `POST /api/dev/seed`. EF Core usa **snake_case** ([D16]).
  En SQLite los `HasPostgresEnum` se omiten (enums como int) y no corren vistas/triggers/RLS
  de `db/`; el saldo/deuda los calcula el backend, así que el flujo funciona igual.
- **No usar** Firebase ni NoSQL (la lógica es relacional). No implementar pasarela de pago.

## Estructura de la carpeta

```
README.md            Índice y resumen del proyecto.
CLAUDE.md            Este archivo.
NOTAS_CAMBIOS.txt    Bitácora de cambios/decisiones grandes (MANTENER ACTUALIZADA).
Referencias/         Identidad de marca del cliente (flyers, horarios, colores).
docs/                Documentación de análisis (01 arquitectura, 02 BD, 03 storage/auth).
db/                  Migraciones SQL para Supabase (esquema, RLS, vistas, seed).
backend/             .NET 8 en capas (Domain → Application → Infrastructure → Api).
frontend/            Next.js 14 (App Router) con el sistema de diseño de marca.
```

## Identidad de marca (aplicada en el frontend)

Fuente: `Referencias/` (flyers del cliente). Es OBLIGATORIO respetarla en cualquier UI nueva.
- **Colores:** NEGRO (`ink`, base `#0B0B0C`) + VERDE LIMA NEÓN (`lime` `#C4F82B`). Tema oscuro.
- **Tipografías:** `Anton` (display, estilo póster) + `Inter` (cuerpo).
- **Slogan:** "BAILÁ · CONECTÁ · DISFRUTÁ". **Datos:** Pablo de María 1474 esq. Brandzen · 092 136 401.
- **Sistema de diseño en `frontend/src/components/ui/`** (Logo, Icons SVG inline, Toast, Button,
  Card, Stat, Avatar, Badge, Skeleton, Field, TopBar/Shell/PageHeader) + `components/format.tsx`
  (etiquetas ES, fechas UY, StatusBadge/PassBadge). Reutilizar SIEMPRE estos componentes; no
  reintroducir estilos claros tipo slate/blanco.

## Endpoints principales del API (.NET)

- Auth: `POST /api/auth/login`. Dev: `POST /api/dev/seed`, `POST /api/dev/seed-horarios`.
- Público (sin auth): `GET /api/public/schedule` (grilla de clases activas para /horarios).
- Check-in: `POST /api/checkin/qr` (Modo A: recepción escanea al alumno). Sesiones:
  `GET /api/sessions/today`, `.../{id}/attendances`, `POST /api/sessions/ensure-today`
  (genera las sesiones de la grilla de hoy; TeacherOrAdmin).
- Modo B (QR dinámico por clase): `GET /api/display/active` (pantalla academia, con token
  rotativo; TeacherOrAdmin) y el alumno `GET /api/me/qr`, `GET /api/me/active-classes`,
  `POST /api/me/scan` (valida token y marca asistencia pendiente).
- Asistencia: `POST /api/attendance/{id}/confirm|reject|correct`, `.../confirm-many`.
- Alumno: `GET /api/me/panel`. Resumen: `GET /api/students/{id}/summary`.
- Admin: `students`, `teachers`, `classes` (alta+listado), `PUT students|teachers|classes/{id}` y
  `.../{id}/active` (editar/baja lógica de alumnos, profesores y clases), `students/{id}` (ficha),
  `passtypes`, `passes` (asignar), `passes/{id}/extend`, `payments`, `payments/pending`,
  `payments/{id}/confirm|cancel`, `debtors`, `alerts` (avisos: alumnos en riesgo +
  pendientes antiguas), `attendance/manual`. Profe/admin: `GET /api/sessions/pending-old`.
  Avisos del alumno: viajan dentro de `GET /api/me/panel` (campo `alerts`).

## Decisiones de negocio CONFIRMADAS (no re-litigar sin avisar)

- **Una sola sede / un solo salón.** Sin clases simultáneas; la regla de no-solape es solo
  (weekday + rango horario), sin dimensión `room`. `room` queda previsto para multi-sala futura.
- **La academia escanea al alumno (Modo A) es el modo primario** de QR a implementar primero.
  El Modo B (alumno escanea a la academia) queda contemplado pero no es prioridad.
- **Vencimiento = 30 días corridos** desde la compra (NO mes calendario), para packs y pase libre.

## Reglas de negocio núcleo (no romper)

- **Asistencia por ventana horaria:** `[hora_fin − 15min, hora_fin + 30min]`. Fuera de ventana →
  pendiente manual para revisión, nunca se descarta.
- **El descuento de clases ocurre SOLO al confirmar** la asistencia (no al check-in).
- **Nunca impedir asistir por falta de saldo** → si no hay saldo, se confirma igual y queda deuda
  (ledger negativo).
- **Cuponeras con ledger de movimientos** (`pass_ledger_entry`), no contador simple. `pass.balance`
  es solo caché desnormalizado, consistente dentro de la misma transacción que el ledger.
- **Correcciones son reversibles por compensación** (nueva fila de ledger), nunca editan historia.
- **Prioridad de consumo:** pase libre (no descuenta) → pack (FIFO por vencimiento) → clase suelta → deuda.
- **Anti-duplicado:** único registro por (alumno, sesión).
- **Auditoría** (`audit_log`) en toda acción sensible: confirmar, corregir, extender, cancelar pago.

## Roles

- **Administrador:** acceso total.
- **Profesor:** ve todas las clases; confirma y corrige asistencias (motivo opcional).
- **Alumno:** autogestión (cuponeras, clases consumidas, historial, asistencias, pagos, deudas).

## Convenciones de trabajo en este repo

- **Idioma:** toda la documentación y comunicación en **español**.
- **Zona horaria de negocio:** `America/Montevideo`. Almacenar en UTC, calcular ventanas en el backend
  (nunca confiar en el reloj del cliente).
- **Bitácora:** ante cualquier cambio o decisión GRANDE, agregar una entrada datada en
  `NOTAS_CAMBIOS.txt` (instrucción explícita del usuario).
- **BD:** `snake_case`, PK `uuid` (`gen_random_uuid()`), timestamps `timestamptz`.
- No agregar funcionalidades complejas sin justificarlas. Ante ambigüedades, proponer alternativas
  con ventajas/desventajas antes de implementar.

## Próximos pasos posibles (sólo si el usuario lo pide)

1. Cerrar el esquema SQL definitivo y migraciones para Supabase.
2. Definir la grilla de endpoints del Web API .NET 8.
3. Prototipo de pantalla de check-in con verificador visual (foto + nombre + saldo).
