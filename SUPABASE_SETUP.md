# Aplicar el esquema en Supabase (proyecto MontevideoMamboProyect)

Datos del proyecto:
- Project ref: `cjqxzabpindinvmekzlu`
- URL: `https://cjqxzabpindinvmekzlu.supabase.co`
- Contraseña de BD: la que definiste al crear el proyecto (va como secreto en el deploy).

---

## ⚠️ Sobre `npm install @supabase/supabase-js @supabase/ssr`

**No hace falta** para cómo está hecha esta app. Ese paquete es para cuando el **frontend
habla directo con Supabase**. Acá el frontend habla con el **backend .NET**, y el backend es
el único que escribe en la base (con su JWT propio). Por eso:
- La **publishable/anon key** (`sb_publishable_...`) hoy **no se usa**.
- Lo que se usa es la **cadena de conexión** de Postgres, y la usa el **backend**.
- Esos paquetes recién harían falta si migramos a **Supabase Auth** o leemos Supabase
  desde el cliente (no es el caso hoy).

---

## Opción A — SQL Editor (recomendada, sin CLI) ✅

1. Entrá al panel de Supabase → tu proyecto → **SQL Editor** → **New query**.
2. Abrí el archivo **`supabase/deploy.sql`** de este repo, copiá TODO y pegalo.
3. **Run**. Crea extensiones, enums, 15 tablas, índices, vistas, triggers, RLS y el seed
   base (roles + tipos de cuponera).

> `deploy.sql` = `db/migrations/001..006` + `db/seed/001_seed_base.sql` concatenados en orden.
> **NO** incluye `db/_init/00_auth_stub.sql` (ese es sólo para Postgres local; Supabase ya
> tiene `auth.uid()` real).

## Opción B — Supabase CLI (`supabase db push`)

Ya dejé las migraciones con timestamp en **`supabase/migrations/`**.
En Windows, instalá el CLI (elegí uno):
- `scoop install supabase`  (o)
- descargá el binario de https://github.com/supabase/cli/releases

Luego, en la raíz del repo:
```bash
supabase login                                   # abre el navegador para autenticarte
supabase link --project-ref cjqxzabpindinvmekzlu # pide la contraseña de la BD
supabase db push                                 # aplica supabase/migrations/*
```

---

## Notas
- **RLS**: las políticas usan `auth.uid()`. El backend se conecta con el usuario `postgres`
  (dueño), que **bypassea RLS**, así que no lo bloquea. La RLS queda como defensa en
  profundidad por si algún día se lee desde el cliente.
- **Seed**: `001_seed_base.sql` inserta roles y tipos de cuponera. Corrilo una sola vez.
- **Siguiente paso (backend → Supabase)**: apuntar el backend a esta base con
  `Database__Provider=Npgsql` y `ConnectionStrings__Supabase=<connection string>` como
  variables de entorno (no en el código). Ver el paquete de deploy cuando lo armemos.
