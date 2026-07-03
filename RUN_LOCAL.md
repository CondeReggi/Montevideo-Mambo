# Correr el proyecto en local

Stack: **Backend .NET 8** + **Frontend Next.js** + base de datos.
Mientras no esté configurado Supabase se usa autenticación propia (JWT) y una
base local. Hay **dos formas** de correr la base:

- **Opción A — SQLite (sin Docker, recomendada para ver la app rápido).**
  No requiere Docker ni instalar Postgres. Es el modo por defecto en
  `appsettings.Development.json` (`Database:Provider = "Sqlite"`).
- **Opción B — PostgreSQL en Docker.** Más fiel a producción (usa el SQL de
  `db/`: migraciones, vistas, triggers, RLS). Requiere Docker Desktop corriendo.

> El proveedor se elige con `Database:Provider` en
> `backend/src/Mambo.Api/appsettings.Development.json`: `"Sqlite"` o `"Npgsql"`.

---

## Opción A — SQLite (sin Docker)

Es el modo por defecto. El esquema se crea solo al arrancar el backend
(`EnsureCreated`) en un archivo `mambo_dev.db`. **Saltar al paso 2 (Backend).**
No hace falta el paso 1 ni Docker.

> Nota: en SQLite NO corre el SQL de `db/` (vistas/triggers/RLS). El saldo y la
> deuda los calcula el backend, así que el flujo funciona igual. Para probar el
> esquema real de PostgreSQL, usar la Opción B.

Para reiniciar la base desde cero: borrar el archivo
`backend/src/Mambo.Api/mambo_dev.db` (se recrea al arrancar) y volver a sembrar.

---

## Opción B — PostgreSQL en Docker

Poner `"Database:Provider": "Npgsql"` en `appsettings.Development.json` y luego:

### 1. Base de datos (PostgreSQL en Docker)

> Requiere Docker Desktop **corriendo** (abrir la app y esperar a que el ícono quede "running").

```bash
docker compose up -d            # levanta Postgres en localhost:55432 y aplica migraciones + seed
docker compose ps               # verificar que está "healthy"
```

La base `mambo` queda creada con todo el esquema. Para reiniciarla desde cero:
```bash
docker compose down -v && docker compose up -d
```

---

## Pasos comunes (ambas opciones)

## 2. Backend (.NET 8)

```bash
cd backend
dotnet run --project src/Mambo.Api
```
- Queda en `http://localhost:5080` (Swagger en `/swagger`).
- La config local está en `src/Mambo.Api/appsettings.Development.json`
  (proveedor de BD, cadena de conexión y clave JWT de desarrollo).
- Con la Opción A (SQLite) el esquema se crea solo al arrancar; con la Opción B
  ya viene del `docker compose`.

### Cargar datos demo
Con el backend corriendo (modo Development):
```bash
curl -X POST http://localhost:5080/api/dev/seed            # usuarios, clase de hoy, cuponeras, pendientes
curl -X POST http://localhost:5080/api/dev/seed-horarios   # grilla real de clases 2026 (23 clases)
```
El primero crea usuarios, una clase de hoy con sesión abierta, cuponeras y asistencias pendientes.
El segundo carga la grilla oficial 2026 (también hay un botón "Cargar horarios 2026" en el panel admin).

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

1. Entrar a `http://localhost:3000` → ver la landing de marca y **Horarios 2026** (`/horarios`).
2. **Ingresar** → login como **admin** → **Panel** (dashboard con métricas):
   - **Alumnos**: alta, buscador y **ficha** de cada alumno (vender cuponera, registrar pago,
     extender vigencia, asistencia manual, **editar datos**, **dar de baja/reactivar** y
     **carnet QR** imprimible a partir del código fijo del alumno).
   - **Cuponeras** (`/admin/passes`): catálogo + venta rápida a un alumno.
   - **Pagos** (`/admin/payments`): registrar pago (confirmado o **pendiente**), gestionar
     **pagos pendientes** (confirmar/cancelar) y lista de **morosos**.
   - **Clases**: grilla por día, **editar** y **dar de baja/alta** cada clase (o cargar los
     horarios 2026 con el botón del dashboard).
   - Botón **"Generar clases de hoy"** (dashboard y panel del profesor): crea las sesiones
     de la grilla del día para poder confirmar asistencias.
3. Login como **profe** → **Clases de hoy** (usar "Generar clases de hoy" si aún no hay
   sesiones) → confirmar/corregir/rechazar pendientes (Ana descuenta de su pack; Leo queda
   en deuda por no tener saldo).
4. **Check-in (recepción)**: ingresar el código de QR (`STU-ANA-001`) para registrar una
   asistencia pendiente y ver la verificación visual (foto/iniciales + nombre + saldo).
5. Login como **alumno** (ana@) → **Mi panel** → saldo, cuponeras, historial y pagos.
6. **Modo B (el alumno marca su asistencia con QR dinámico):**
   - En la máquina/pantalla de la academia: login admin/profe → **Pantalla QR** (`/display`)
     → muestra un **QR dinámico por clase activa** (rota cada ~60s; refresca solo).
   - En el celular del alumno (o el navegador): login alumno → **Mi panel** → card
     **"Marcar asistencia"** → elegí la clase que está corriendo → **Escanear** → apuntá al
     QR de `/display`. Queda una asistencia **pendiente** (la confirma el profe).
   - La misma pantalla del alumno tiene **"Mi QR"** para el Modo A (que la recepción lo escanee).
   - Nota: para ver una clase activa al instante en local, el seed crea una sesión alrededor de
     "ahora"; el seed es idempotente, así que para reprobarlo borrá `mambo_dev.db` y re-sembrá.

## Notas
- **SQLite (Opción A) es solo para desarrollo/demo.** No corre el SQL de `db/`
  (vistas, triggers de balance, RLS). El saldo/deuda los calcula el backend, por
  lo que el flujo funciona igual; para validar el esquema real usar la Opción B.
- El `auth.uid()` de Supabase no existe en Postgres plano; `db/_init/00_auth_stub.sql` lo simula
  solo en local (no aplicar en Supabase).
- Las fotos de alumnos requieren Supabase Storage; en local se muestran las iniciales.
- Para pasar a Supabase: aplicar `db/migrations/*` en el proyecto Supabase (sin el stub),
  cargar la cadena de conexión y, si se desea, migrar la autenticación a Supabase Auth.
