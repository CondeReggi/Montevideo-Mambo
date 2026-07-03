# Publicar la app gratis (Vercel + Render + Supabase)

Arquitectura del deploy:

```
[ Celular / navegador ]
        │  HTTPS
        ▼
[ Frontend Next.js  → Vercel ]  ── NEXT_PUBLIC_API_URL ──►  [ Backend .NET → Render (Docker) ]
                                                                      │  Npgsql + SSL
                                                                      ▼
                                                             [ Postgres → Supabase ]
```

- **Supabase** ya está listo (esquema aplicado + datos). Ver `SUPABASE_SETUP.md`.
- **Backend** se publica como imagen Docker en **Render** (free).
- **Frontend** se publica en **Vercel** (free), con la URL del backend en una variable.

> Costo real gratis: el backend en Render **se duerme** tras ~15 min sin uso (primer
> request ~30-60s), y las bases free de Supabase **pausan** por inactividad prolongada.

---

## 0) Generar los secretos (una vez)

Necesitás 2 claves aleatorias largas (32+ caracteres):

- **PowerShell:**
  ```powershell
  [Convert]::ToBase64String((1..48 | % {Get-Random -Max 256}))
  ```
- **Git Bash / Linux/Mac:**
  ```bash
  openssl rand -base64 48
  ```

Generá una para `Jwt__Key` y otra para `Qr__Secret`. Guardalas (las cargás en Render).

La **cadena de conexión de Supabase** (para `ConnectionStrings__Supabase`):
```
Host=db.cjqxzabpindinvmekzlu.supabase.co;Port=5432;Database=postgres;Username=postgres;Password=TU_PASSWORD_SUPABASE;SSL Mode=Require;Trust Server Certificate=true
```
(La contraseña es la del proyecto Supabase. En Supabase: Settings → Database.)

---

## 1) Subir el código a GitHub

El repo ya está inicializado en `main`. Creá un repo vacío en GitHub y:
```bash
git remote add origin https://github.com/TU_USUARIO/montevideo-mambo.git
git push -u origin main
```
> No se sube ningún secreto: `.gitignore` excluye `.env.local`, la base local y `bin/obj`.
> La contraseña de Supabase NO está en el repo (va como variable de entorno en Render).

---

## 2) Backend en Render (Docker, free)

Opción rápida con el blueprint incluido (`render.yaml`):

1. Entrá a https://render.com → **New +** → **Blueprint** → conectá tu repo de GitHub.
2. Render detecta `render.yaml` y crea el servicio `mambo-api`.
3. En **Environment**, completá los valores marcados como secretos:
   - `ConnectionStrings__Supabase` = la cadena del paso 0.
   - `Jwt__Key` = la clave 1.
   - `Qr__Secret` = la clave 2.
   - `Cors__Origins` = lo dejás vacío por ahora; lo completás en el paso 4.
4. **Create** / **Apply**. Render construye la imagen (`backend/Dockerfile`) y la despliega.
5. Cuando termine, tenés una URL tipo `https://mambo-api.onrender.com`.
   Probá `https://mambo-api.onrender.com/health` → `{"status":"ok"}`.

> Alternativa sin blueprint: New + → **Web Service** → repo → Runtime **Docker**,
> Dockerfile Path `backend/Dockerfile`, Docker Context `backend`, y cargás las mismas
> variables a mano. Health check path: `/health`.

---

## 3) Frontend en Vercel (free)

1. Entrá a https://vercel.com → **Add New… → Project** → importá el repo de GitHub.
2. **IMPORTANTE — Root Directory:** `frontend` (el proyecto Next está en esa subcarpeta).
   Vercel autodetecta Next.js (build `next build`, sin tocar nada más).
3. En **Environment Variables** agregá:
   - `NEXT_PUBLIC_API_URL` = la URL del backend de Render (ej. `https://mambo-api.onrender.com`).
   > Ojo: `NEXT_PUBLIC_*` se "hornea" en el build. Si la cambiás, hay que **redeploy**.
4. **Deploy**. Te queda una URL tipo `https://montevideo-mambo.vercel.app`.

---

## 4) Conectar CORS (backend ← frontend)

1. En **Render** → servicio `mambo-api` → **Environment** → editá `Cors__Origins` con la
   URL de Vercel: `https://montevideo-mambo.vercel.app`
   (varias separadas por `;` si tenés dominios extra).
2. Guardá → Render redeploya el backend.

Sin este paso, el navegador bloquea las llamadas del front al back (error de CORS).

---

## 5) Probar de punta a punta

1. Abrí la URL de Vercel en el celular (HTTPS ✓).
2. Login con un usuario (los demo: `admin@mambo.local` / `Admin1234!`, si sembraste demo).
3. Aparece el **aviso de instalación PWA** → "Instalar app" (o Ajustes ⚙ → Instalar).
4. Probá check-in / cámara (funciona porque es HTTPS).

> Primer request tras inactividad: el backend de Render tarda ~30-60s en "despertar".
> Es normal en el plan free.

---

## Notas y siguientes pasos
- **Datos reales:** para producción real conviene crear un **admin propio** (no el demo) y
  borrar los alumnos demo. (Pendiente de backlog: alta de admin desde afuera.)
- **Fotos de alumnos:** requieren Supabase **Storage** (pendiente).
- **Mantener despierto** el backend (opcional): un ping cada 10-14 min a `/health` con un
  cron gratis (ej. cron-job.org) evita el cold start. No abusar (el plan free tiene horas).
- **Dominio propio:** tanto Vercel como Render permiten dominio custom gratis (vos ponés el dominio).
