# APP Montevideo MAMBO — Sistema de Gestión para Academia de Baile

Aplicación web (responsive, preparada para PWA/app futura) para la gestión integral de una academia
de baile: alumnos, profesores, clases, asistencias por QR, cuponeras, pagos y deudas.

## Stack objetivo
- **Frontend:** React / Next.js (responsive + PWA).
- **Backend:** .NET 8 Web API (toda la lógica de negocio).
- **Base de datos:** Supabase PostgreSQL.
- **Storage:** Supabase Storage (fotos de alumnos, QR imprimibles).
- **Auth:** Supabase Auth + validación de JWT en .NET.

## Estado actual
🟢 **En desarrollo.** Las tres capas existen, compilan y corren en local:
- `db/` — migraciones SQL para Supabase (esquema, índices, RLS, vistas, seed).
- `backend/` — .NET 8 en capas, con reglas de asistencia/cuponeras y **12 tests en verde**.
- `frontend/` — Next.js 14 con **identidad de marca aplicada** (negro + verde lima neón, ver
  `Referencias/`): landing, login, horarios 2026, check-in, panel del profesor, panel del alumno
  y panel de administración completo.

**Funcionalidad lista:** login por rol, alta de alumnos/profesores/clases, check-in por QR con
verificación visual, panel del profesor (confirmar/corregir/rechazar), panel del alumno, y
**gestión admin**: venta y extensión de cuponeras, pagos manuales, morosos, ficha del alumno y
asistencia manual. Grilla de horarios 2026 sembrable con un clic.

➡️ **Para correr todo local en minutos: ver [`RUN_LOCAL.md`](RUN_LOCAL.md).** Dos opciones:
**SQLite sin Docker** (por defecto, ideal para ver la app rápido) o **Postgres en Docker**
(fiel a producción). En ambas, `dotnet run` + `npm run dev` con datos demo y usuarios de prueba.

Ver `NOTAS_CAMBIOS.txt` para el detalle de avances y `backend/README.md` / `frontend/README.md`
para correr cada parte.

## Documentación (`/docs`)
1. [`01-ANALISIS-Y-ARQUITECTURA.md`](docs/01-ANALISIS-Y-ARQUITECTURA.md) — Modelo de dominio,
   arquitectura, flujos (asistencia, cuponeras, pagos), problemas de negocio, casos borde y mejoras.
2. [`02-ESQUEMA-BD.md`](docs/02-ESQUEMA-BD.md) — Esquema de tablas, PK/FK, índices, vistas, RLS y
   reglas transaccionales para Supabase PostgreSQL.
3. [`03-SUPABASE-STORAGE-Y-AUTH.md`](docs/03-SUPABASE-STORAGE-Y-AUTH.md) — Almacenamiento de fotos y
   decisión de autenticación.

## Registro de cambios
Ver [`NOTAS_CAMBIOS.txt`](NOTAS_CAMBIOS.txt) — bitácora de cambios y decisiones grandes.

## Roles
- **Administrador:** acceso total (alumnos, profesores, clases, cuponeras, pagos, asistencias, confirmaciones, correcciones, extensiones).
- **Profesor:** ve todas las clases, confirma y corrige asistencias.
- **Alumno:** autogestión (cuponeras, clases consumidas, historial, asistencias, pagos y deudas).

## Decisiones clave
- Asistencia por **QR + ventana horaria** (`[fin−15min, fin+30min]`), confirmada por el profesor.
- El **descuento de clases ocurre solo al confirmar** (nunca se impide asistir por falta de saldo → genera deuda).
- Cuponeras modeladas con **ledger de movimientos** (auditable, soporta saldo negativo y correcciones).
- Pagos **100% manuales** (sin pasarela).
