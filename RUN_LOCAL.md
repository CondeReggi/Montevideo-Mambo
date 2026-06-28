# Correr el proyecto en local

Stack: **PostgreSQL (Docker)** + **Backend .NET 8** + **Frontend Next.js**.
Mientras no esté configurado Supabase, se usa un Postgres local y autenticación propia (JWT).

## 1. Base de datos (PostgreSQL en Docker)

> Requiere Docker Desktop **corriendo** (abrir la app y esperar a que el ícono quede "running").

```bash
docker compose up -d            # levanta Postgres en localhost:55432 y aplica migraciones + seed
docker compose ps               # verificar que está "healthy"
```

La base `mambo` queda creada con todo el esquema. Para reiniciarla desde cero:
```bash
docker compose down -v && docker compose up -d
```

## 2. Backend (.NET 8)

```bash
cd backend
dotnet run --project src/Mambo.Api
```
- Queda en `http://localhost:5080` (Swagger en `/swagger`).
- La config local está en `src/Mambo.Api/appsettings.Development.json`
  (cadena de conexión al Postgres local y clave JWT de desarrollo).

### Cargar datos demo
Con el backend corriendo (modo Development):
```bash
curl -X POST http://localhost:5080/api/dev/seed
```
Crea usuarios, una clase de hoy con sesión abierta, cuponeras y asistencias pendientes.

**Usuarios demo:**
| Rol | Email | Contraseña |
|---|---|---|
| Admin | admin@mambo.local | Admin1234! |
| Profesor | profe@mambo.local | Profe1234! |
| Alumno | ana@mambo.local | Alumno1234! |
| Alumno | leo@mambo.local | Alumno1234! |

(También se puede sembrar desde la pantalla de login con el botón "Cargar datos demo".)

## 3. Frontend (Next.js)

```bash
cd frontend
npm install        # primera vez
npm run dev        # http://localhost:3000
```
`NEXT_PUBLIC_API_URL` ya apunta a `http://localhost:5080` en `.env.local`.

## 4. Probar el flujo completo

1. Entrar a `http://localhost:3000` → **Ingresar**.
2. Login como **admin** → crear más alumnos/clases si se quiere.
3. Login como **profe** → **Panel del profesor** → ver la clase de hoy → confirmar pendientes
   (Ana descuenta de su pack; Leo queda en deuda por no tener saldo).
4. **Check-in (recepción)**: ingresar manualmente un código de QR (`STU-ANA-001`) para registrar
   una asistencia pendiente y ver la verificación visual.
5. Login como **alumno** (ana@) → **Mi panel** → ver saldo, cuponeras, historial y pagos.

## Notas
- El `auth.uid()` de Supabase no existe en Postgres plano; `db/_init/00_auth_stub.sql` lo simula
  solo en local (no aplicar en Supabase).
- Las fotos de alumnos requieren Supabase Storage; en local se muestran las iniciales.
- Para pasar a Supabase: aplicar `db/migrations/*` en el proyecto Supabase (sin el stub),
  cargar la cadena de conexión y, si se desea, migrar la autenticación a Supabase Auth.
