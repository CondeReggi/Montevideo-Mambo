# Supabase Storage (fotos) y Autenticación

> Detalle operativo de cómo guardar fotos de alumnos y la decisión de autenticación.

---

## 1. Fotos de alumnos en Supabase Storage

### 1.1 Buckets
| Bucket | Visibilidad | Contenido |
|---|---|---|
| `student-photos` | **privado** | foto de perfil del alumno (verificación visual en check-in) |
| `qr-prints` | privado | PDF/PNG del QR fijo imprimible |

### 1.2 Estructura de rutas (paths)
```
student-photos/students/{student_id}/{uuid}.webp
qr-prints/students/{student_id}/qr.pdf
```
Usar `student_id` (uuid) en el path → fácil aplicar políticas y limpieza por alumno.
Guardar en `student.photo_path` la ruta del objeto (no una URL pública).

### 1.3 Flujo de subida (recomendado: vía backend)
```
1. Frontend envía la imagen al .NET Web API (multipart) o pide una "signed upload URL".
2. Backend valida:
      - tipo MIME ∈ {jpeg, png, webp}
      - tamaño ≤ ~2 MB
      - re-encode/normaliza a webp, recorte cuadrado opcional.
3. Backend sube a Storage con la service role key.
4. Backend guarda photo_path en la fila del alumno.
```
*Alternativa* (signed upload URL directa desde el navegador): menos carga en el backend, pero hay que
validar tipo/tamaño igual y confiar menos en el cliente. Recomendado **subir vía backend** por control.

### 1.4 Flujo de lectura (mostrar la foto)
- Bucket privado → **no** hay URL pública.
- El backend genera una **signed URL** de corta vida (ej. 300 s) cuando una pantalla autorizada
  (recepción, panel del profesor) necesita mostrar la foto en el check-in.
- Así la foto no queda expuesta permanentemente.

### 1.5 Privacidad
- Fotos de personas = dato sensible. Bucket privado + URLs firmadas cortas + borrado al dar de baja
  (o anonimizar). Documentar consentimiento del alumno al registrar la foto.

---

## 2. Autenticación — decisión

**Recomendado: Supabase Auth + validación de JWT en .NET 8.** (Análisis completo en
`01-ANALISIS-Y-ARQUITECTURA.md` §13).

### 2.1 Cómo encaja
```
Login (frontend) ──► Supabase Auth ──► devuelve access_token (JWT) + refresh_token
Frontend ──(Bearer JWT)──► .NET Web API
.NET valida el JWT con el JWKS público de Supabase (issuer/audience/exp/firma)
.NET mapea jwt.sub → app_user.id → carga roles desde user_role
.NET autoriza por rol (admin/teacher/student) en cada endpoint
```

### 2.2 Claves de Supabase (manejo)
| Clave | Quién la usa | Notas |
|---|---|---|
| `anon` key | Frontend | solo login/refresh y, si se habilita, lecturas RLS del propio alumno |
| `service_role` key | **solo backend .NET** | bypassea RLS; NUNCA exponer al cliente |
| JWT secret / JWKS | backend (validación) | usar JWKS público para verificar firma |

### 2.3 Roles
- Los roles de negocio viven en `role`/`user_role` (nuestra BD), no solo en el claim del token.
- El backend es la autoridad de autorización. Opcional: replicar el rol como **custom claim** para RLS.

### 2.4 Alternativa (independencia del proveedor)
ASP.NET Identity + JWT propio. Solo si hay requisito explícito de no depender de Supabase Auth.
Costo: reconstruir email verification, reset de contraseña, y perder `auth.uid()` nativo para RLS.

---

## 3. Variables de entorno previstas (referencia, sin valores)
```
SUPABASE_URL
SUPABASE_ANON_KEY            (frontend)
SUPABASE_SERVICE_ROLE_KEY   (backend, secreto)
SUPABASE_JWT_JWKS_URL       (backend, validación)
SUPABASE_DB_CONNECTION      (backend, Npgsql)
STORAGE_BUCKET_PHOTOS=student-photos
STORAGE_BUCKET_QR=qr-prints
TZ_BUSINESS=America/Montevideo
```
