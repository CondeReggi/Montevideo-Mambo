# Backend — Mambo API (.NET 8)

API REST que concentra toda la lógica de negocio de la academia. Es la única autoridad de
escritura sobre la base de datos Supabase.

## Arquitectura en capas

```
src/
  Mambo.Domain          Entidades + reglas puras (ventana de asistencia, política de consumo)
  Mambo.Application      Casos de uso (CheckIn, confirmación de asistencia) + abstracciones
  Mambo.Infrastructure   EF Core + Npgsql (Supabase), auditoría, reloj, DI
  Mambo.Api              Controllers, autenticación JWT (Supabase), CORS, Swagger
tests/
  Mambo.Domain.Tests     Pruebas de las reglas de negocio (xUnit)
```

Dependencias entre capas: `Api → Infrastructure → Application → Domain`.

## Requisitos
- .NET SDK 8+ (se targetea `net8.0`).
- Base Supabase con las migraciones de `../db` aplicadas.

## Configuración
Copiar `.env.example` y completar, o crear `src/Mambo.Api/appsettings.Development.json` con la
cadena de conexión `ConnectionStrings:Supabase` y la sección `Supabase`.

## Comandos
```bash
dotnet build                                   # compilar todo
dotnet test                                    # correr pruebas de dominio
dotnet run --project src/Mambo.Api             # levantar la API (Swagger en /swagger)
```

## Endpoints implementados (primera iteración)
| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| GET  | `/health` | público | healthcheck |
| POST | `/api/checkin/qr` | profesor/admin | la academia escanea el QR del alumno (modo primario) |
| GET  | `/api/attendance/session/{id}/pending` | profesor/admin | lista de pendientes de la clase |
| POST | `/api/attendance/{id}/confirm` | profesor/admin | confirma 1 (descuenta cuponera) |
| POST | `/api/attendance/confirm-many` | profesor/admin | confirma una lista en transacción |
| POST | `/api/attendance/{id}/reject` | profesor/admin | rechaza pendiente (sin efecto en saldo) |
| POST | `/api/attendance/{id}/correct` | profesor/admin | corrige (revierte consumo por compensación) |

## Reglas de negocio implementadas
- Ventana de asistencia `[fin−15min, fin+30min]` (`Domain/Rules/AttendanceWindow`).
- Detección de sesión + anti-duplicado + fuera de ventana → pendiente (`CheckInService`).
- Consumo de cuponera con prioridad pase libre → pack FIFO → suelta → deuda
  (`Domain/Rules/ConsumptionPolicy` + `AttendanceConfirmationService`).
- Nunca se impide confirmar por falta de saldo (genera deuda).
- Correcciones por compensación en el ledger (no editan historia) + auditoría.

## Pendiente (próximas iteraciones)
- Endpoints de alumnos, profesores, clases, cuponeras y pagos (CRUD admin).
- Panel del alumno (saldo, historial) sobre la vista `student_balance`.
- Subida de fotos a Supabase Storage (URLs firmadas).
- Generación/validación de tokens QR dinámicos (Modo B).
- Migraciones EF como alternativa al SQL de `../db` (hoy el SQL es la fuente de verdad del esquema).
