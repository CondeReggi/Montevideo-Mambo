# Academia de Baile — Análisis Funcional y Arquitectura

> Documento de diseño previo a la implementación. **No contiene código.**
> Stack objetivo: **Frontend React/Next.js · Backend .NET 8 Web API · Supabase PostgreSQL + Storage**.
> Fecha de elaboración: 2026-06-28.

---

## 0. Resumen ejecutivo

El sistema gestiona una academia de baile con tres roles (Administrador, Profesor, Alumno).
El eje central es la **asistencia automática por QR con confirmación del profesor**, y el
**consumo de cuponeras** (paquetes de clases, pases libres y clases sueltas) que solo se
descuentan cuando la asistencia es confirmada. Los pagos son 100% manuales en esta etapa.

Decisiones clave que se justifican en el documento:

- **Backend .NET 8** posee TODA la lógica de negocio y es el único que escribe en la BD. Supabase
  se usa como **PostgreSQL administrado + Storage**, no como backend directo del frontend.
- **Autenticación: Supabase Auth** para identidad y emisión de JWT, validado por .NET. (Ver §13).
- El descuento de clases se modela con un **libro mayor de movimientos (ledger)**, no con un simple
  contador, para soportar saldos negativos, deudas, correcciones y auditoría.
- La detección de "a qué clase corresponde un check-in" se resuelve por **ventana horaria** en el backend.

---

## 1. Modelo de dominio (entidades y relaciones)

### 1.1 Entidades principales

| Entidad | Descripción |
|---|---|
| **Usuario (AppUser)** | Identidad de login. Tiene uno o más roles. Vincula a Alumno/Profesor/Admin. |
| **Rol** | Administrador, Profesor, Alumno. |
| **Alumno (Student)** | Perfil del alumno. Foto, datos de contacto, QR fijo. |
| **Profesor (Teacher)** | Perfil del profesor. |
| **Clase (DanceClass)** | Plantilla de clase recurrente: nombre, estilo, nivel, día, hora inicio/fin, profesores. |
| **SesiónDeClase (ClassSession)** | Instancia concreta de una clase en una fecha (ej: "Salsa Nivel 2" del 2026-06-30). |
| **ClaseProfesor (ClassTeacher)** | Relación N:M entre Clase y Profesor. |
| **TipoDeCuponera (PassType)** | Catálogo: "10 clases", "Pase libre mensual", "Clase suelta". |
| **Cuponera (Pass)** | Instancia comprada por un alumno: saldo, vencimiento, estado. |
| **Asistencia (Attendance)** | Registro de asistencia de un alumno a una sesión. Estado y origen. |
| **MovimientoDeCuponera (PassLedgerEntry)** | Cada débito/crédito sobre una cuponera (consumo, extensión, ajuste). |
| **Pago (Payment)** | Pago manual registrado por admin. Asociado a cuponera o clase suelta. |
| **Deuda (Debt)** | Saldo negativo o monto adeudado. Se modela como saldo derivado + asistencias sin cobertura. |
| **TokenQR (QrToken)** | Token dinámico de corta vida para check-in/out seguro. |
| **LogDeAuditoría (AuditLog)** | Quién hizo qué y cuándo (correcciones, extensiones, confirmaciones). |

### 1.2 Relaciones (resumen)

```
AppUser 1—1 Student        (un usuario alumno tiene un perfil de alumno)
AppUser 1—1 Teacher        (idem profesor)
AppUser N—N Role           (via UserRole)

DanceClass N—N Teacher     (via ClassTeacher)
DanceClass 1—N ClassSession
ClassSession 1—N Attendance

Student 1—N Pass
PassType 1—N Pass
Pass 1—N PassLedgerEntry

Student 1—N Attendance
Attendance 0—1 PassLedgerEntry   (la confirmación genera el débito)

Student 1—N Payment
Payment 0—1 Pass                 (un pago puede crear/abonar una cuponera)
Payment 0—N Attendance          (un pago de "clase suelta" cubre una asistencia)

Student 1—1 QrToken (fijo) + 0—N QrToken (dinámicos temporales)
```

### 1.3 Diagrama conceptual (texto)

```
                 ┌────────────┐
                 │  AppUser   │──< UserRole >── Role
                 └─────┬──────┘
          ┌────────────┼─────────────┐
       Student       Teacher        (Admin = rol sobre AppUser)
          │             │
          │             └──< ClassTeacher >── DanceClass ──1:N── ClassSession
          │                                                          │
          ├──1:N── Pass ──N:1── PassType                             │
          │          │                                               │
          │          └──1:N── PassLedgerEntry ───────┐               │
          │                                          │               │
          ├──1:N── Attendance ──N:1───────────────────────────── ClassSession
          │            │ (confirmada genera) ────────┘
          │
          ├──1:N── Payment ──0:1── Pass
          └──1:1── QrToken (fijo)
```

---

## 2. Arquitectura recomendada

### 2.1 Vista de alto nivel

```
┌─────────────────────────┐      HTTPS / JWT      ┌──────────────────────────┐
│  Frontend (Next.js)     │ ───────────────────►  │   .NET 8 Web API         │
│  - PWA / responsive     │ ◄───────────────────  │   - Lógica de negocio     │
│  - Supabase Auth (login)│                       │   - Reglas asistencia     │
│  - Scanner QR (cámara)  │                       │   - Consumo cuponeras     │
└───────────┬─────────────┘                       │   - Pagos / deudas        │
            │                                      └───────────┬──────────────┘
            │ (solo login/refresh                              │ Npgsql / EF Core
            │  token vía Supabase)                             │ (service role)
            ▼                                                  ▼
   ┌──────────────────┐                            ┌───────────────────────────┐
   │  Supabase Auth   │◄──── valida JWKS ──────────│   Supabase PostgreSQL     │
   └──────────────────┘                            │   + RLS de respaldo       │
                                                   └───────────────────────────┘
   ┌──────────────────────────────────────────────┐
   │  Supabase Storage (fotos de alumnos, QR PDF)  │  ◄── URLs firmadas vía .NET
   └──────────────────────────────────────────────┘
```

### 2.2 Principios

1. **El backend .NET es la única autoridad de escritura de negocio.** El frontend NO escribe
   directo a PostgreSQL ni hace lógica de consumo de cuponeras. Esto evita duplicar reglas críticas
   (descuentos, deudas, ventanas horarias) en cliente.
2. **Supabase Auth emite la identidad**; .NET valida el JWT contra el JWKS público de Supabase.
   Así reutilizamos login social/email, recuperación de contraseña, etc., sin construirlo.
3. **RLS (Row Level Security) en Postgres como defensa en profundidad**, no como lógica principal.
   Si en el futuro algún cliente lee directo de Supabase, las políticas RLS protegen los datos.
4. **Storage para binarios** (fotos, PDF de QR fijo). El backend genera URLs firmadas de corta vida.

### 2.3 Capas del backend .NET 8

```
API (Controllers / Minimal API)
  └─ Application (casos de uso, validaciones, DTOs)
       └─ Domain (entidades, reglas: ventana horaria, consumo de saldo, estados)
            └─ Infrastructure (EF Core + Npgsql, Supabase Storage client, Auth/JWKS)
```

- **Domain** contiene las reglas puras (sin dependencias): cálculo de ventana, máquina de estados de
  asistencia, política de consumo de cuponera.
- **Application** orquesta transacciones (confirmar asistencia = cambiar estado + crear movimiento de
  cuponera + posible deuda, todo atómico).
- **Infrastructure** habla con Postgres y Storage.

### 2.4 Por qué Next.js

- SSR/SSG + buen soporte PWA (service worker, instalable).
- Rutas API propias para BFF si hiciera falta (proxy de URLs firmadas, etc.).
- Migración futura a app nativa (Capacitor/Expo con la misma API) sin reescribir el backend.

---

## 3. Diseño de base de datos

> Detalle SQL completo (tipos, PK/FK, índices, constraints) en `docs/02-ESQUEMA-BD.md`.
> Aquí va la visión y las decisiones.

### 3.1 Decisiones de modelado

- **`class_session` (sesión por fecha) separada de `dance_class` (plantilla).**
  Justificación: la asistencia ocurre en una fecha concreta; necesitamos un objeto al que colgar las
  asistencias, permitir clases canceladas/movidas y reportes por sesión. La sesión puede crearse
  perezosamente (al primer check-in del día) o por un job que materializa la grilla semanal.
  - *Alternativa más simple:* guardar `attendance.class_date` y referenciar solo `dance_class`.
    Ventaja: menos tablas. Desventaja: no se pueden cancelar/editar sesiones puntuales ni asignar
    profesor sustituto en una fecha. **Recomendado: usar `class_session`** porque una academia real
    tiene feriados, suplencias y cambios puntuales.

- **Ledger de cuponera (`pass_ledger_entry`) en vez de un contador `remaining`.**
  Cada consumo, extensión o ajuste es una fila inmutable con signo. El saldo es la suma.
  Justificación: trazabilidad total, soporta saldo negativo/deuda, correcciones reversibles
  (una corrección crea un crédito compensatorio en lugar de editar historia). Se puede cachear el
  saldo en `pass.balance` como columna desnormalizada actualizada por trigger/transacción para
  lecturas rápidas.

- **Deuda derivada, no tabla "mágica".** La deuda surge de: (a) asistencias confirmadas sin cuponera
  con saldo → genera movimiento negativo, y (b) cuponeras impagas. Se expone como una **vista**
  `student_balance` que cruza pagos, consumos y saldos. Opcionalmente una tabla `debt` para deudas
  explícitas creadas por el admin.

### 3.2 Estados (enums)

- `attendance_status`: `pending`, `confirmed`, `rejected`, `corrected`.
- `attendance_source`: `qr_student_scans_academy`, `qr_academy_scans_student`, `manual_admin`, `out_of_window_manual`.
- `pass_kind`: `class_pack` (N clases), `unlimited_month` (pase libre), `single_class` (suelta).
- `pass_status`: `active`, `expired`, `exhausted`, `cancelled`.
- `payment_status`: `pending`, `confirmed`, `cancelled`.
- `ledger_reason`: `consume`, `purchase_credit`, `manual_adjust`, `extension`, `correction_reverse`.

---

## 4. Flujo completo de asistencia

### 4.1 Camino feliz (alumno con app)

```
1. Alumno abre la app al final de la clase y solicita check-out.
2. Frontend pide al backend un token dinámico (o escanea el QR de la academia).
3. Backend recibe el check-in con: student_id, timestamp, (modo QR).
4. Backend busca la SESIÓN candidata por VENTANA HORARIA:
      ventana = [fin - 15min , fin + 30min]
      se elige la class_session cuya ventana contiene 'ahora'.
5. ¿Hay exactamente una sesión candidata?
      - Sí  → crear Attendance(status=pending, source=...).
      - No (cero) → crear Attendance(status=pending, source=out_of_window_manual) marcada para revisión.
      - Más de una (solape no permitido por regla, pero defensivo) → pending + flag de ambigüedad.
6. Verificar DUPLICADO (student_id + class_session_id + date) → si existe, no crear otra; devolver la existente.
7. NO se descuenta nada todavía.
8. El profesor ve la lista de pendientes de su clase.
9. Profesor CONFIRMA (uno o todos):
      - status → confirmed
      - se ejecuta el consumo de cuponera (ver §5) en la MISMA transacción.
10. (Opcional) Profesor/Admin CORRIGE luego:
      - status → corrected (motivo opcional)
      - si ya se había descontado, se crea movimiento compensatorio (crédito).
```

### 4.2 Reglas de la ventana horaria

- Apertura: `hora_fin - 15 min`. Cierre: `hora_fin + 30 min`.
- Fuera de ventana → permitido como **pendiente manual** (`out_of_window_manual`) para revisión, nunca
  se descarta silenciosamente.
- El **administrador** puede crear asistencias **manuales** sin check-in previo (source `manual_admin`),
  eligiendo sesión y alumno; puede saltarse la ventana.

### 4.3 Máquina de estados

```
                 confirmar
   pending ─────────────────► confirmed ──corregir──► corrected
      │                            ▲                       │
      │ rechazar                   │ (reapertura admin)    │ (genera crédito si hubo débito)
      ▼                            │                       ▼
   rejected ◄────────────────────────────────────── (sin efecto en saldo)
```

- `pending → confirmed`: descuenta (o genera deuda).
- `pending → rejected`: sin efecto en saldo.
- `confirmed → corrected`: revierte el débito con un crédito compensatorio (no edita el original).
- Toda transición queda en `audit_log` con actor, motivo (opcional) y timestamp.

---

## 5. Flujo de cuponeras

### 5.1 Selección de cuponera al confirmar

Al confirmar una asistencia, el backend elige **qué cuponera consumir** con esta prioridad:

```
1. ¿Existe un PASE LIBRE mensual activo y vigente?  → NO se descuenta nada (solo se marca cobertura).
2. ¿Hay class_pack ACTIVA con saldo > 0?            → consumir 1, FIFO por vencimiento más próximo.
3. ¿Hay clase suelta (single_class) pagada sin usar?→ consumir esa.
4. Si nada de lo anterior:
      - igualmente se confirma (regla: nunca impedir asistir),
      - se crea movimiento negativo en una cuponera "deuda" o se genera registro de deuda.
```

Justificación del FIFO por vencimiento: minimiza cuponeras vencidas con saldo desperdiciado.

### 5.2 Reglas de vencimiento

- Toda cuponera tiene `valid_from` y `valid_to`.
- **Vencimiento = 30 días corridos** desde `valid_from` (CONFIRMADO con el negocio: NO es mes
  calendario). `valid_to = valid_from + 30 días`. Aplica a packs y al **pase libre**.
- El pase libre cubre todas las clases dentro de su ventana de 30 días corridos; al día 31 deja de cubrir.
- Una cuponera vencida con saldo NO se consume automáticamente; queda visible como "vencida".
- El **admin puede extender** `valid_to` → genera movimiento `extension` en el ledger + audit log.
- Un job diario marca `pass.status = expired` cuando `valid_to < hoy` y saldo no agotado.

### 5.3 Saldo negativo / deuda

- Si se consume sin saldo, el ledger queda negativo. El alumno ve "Debes 1 clase / $X".
- Cuando luego paga, el admin registra el pago → crea crédito que primero **cancela el negativo**.

---

## 6. Flujo de pagos (manual)

```
1. Admin crea Payment(student, amount, method, status=pending o confirmed).
2. Admin asocia el pago a:
      - una NUEVA cuponera (compra de pack/pase libre)  → al confirmar, crea Pass + ledger credit.
      - una clase suelta                                 → cubre 1 asistencia / crea crédito de 1.
      - saldo de deuda                                   → cancela movimientos negativos.
3. Confirmar pago (status=confirmed) dispara los efectos anteriores en transacción.
4. Cancelar pago revierte efectos (crédito → débito compensatorio) y queda auditado.
```

- No hay pasarela. `method` es texto/enum (efectivo, transferencia, etc.).
- La **deuda** se ve en la vista `student_balance`: total pagado − total consumido − cuponeras impagas.

---

## 7. Posibles problemas de negocio

1. **Solape de clases vs. regla de "no dos clases al mismo horario".** CONFIRMADO: hoy hay **una sola
   sede y un solo salón**, por lo que NO existen clases simultáneas y la ventana horaria identifica la
   clase sin ambigüedad. Se prohíbe el solape de horarios con un constraint simple (sin dimensión
   `room`). Si en el futuro hubiera varios salones, habría que agregar `room` y que el alumno elija
   sala al hacer check-in. **El modelo deja `room` previsto pero hoy no se usa para distinguir.**
2. **¿Quién confirma si el profesor olvida?** Asistencias pendientes que nadie confirma quedarían sin
   descontar para siempre. → Necesario: panel de "pendientes antiguas" + recordatorio + posible
   auto-expiración configurable (ej: pending > 7 días → alerta al admin).
3. **Doble consumo por correcciones mal hechas.** → El modelo de ledger compensatorio (no editar)
   evita inconsistencias; toda corrección es reversible y auditada.
4. **Pase libre + packs simultáneos.** ¿Qué consume? → Regla explícita: el pase libre tiene prioridad
   y nunca descuenta. Si conviven, no se "gasta" el pack mientras el pase esté vigente.
5. **Cuponera comprada pero impaga (a crédito).** El alumno asiste, ¿se le permite? → Sí (nunca
   impedir asistir). Queda deuda. El admin debe poder ver morosos.
6. **Cambio de horario de una clase a mitad de mes.** Asistencias viejas referencian la sesión, no la
   plantilla, así que no se corrompen. La plantilla cambia hacia adelante.
7. **Husos horarios / hora del servidor.** La ventana depende del reloj. → Fijar todo en zona
   `America/Montevideo`, almacenar en UTC, calcular ventana en backend (no confiar en el reloj del
   cliente).

---

## 8. Casos borde a contemplar

- Alumno hace check-in **dos veces** en la misma sesión → se devuelve la asistencia existente (idempotente).
- Check-in **justo en el borde** de la ventana (segundo exacto) → definir inclusivo/exclusivo. Recomendado
  `[fin-15, fin+30]` inclusivo en ambos extremos.
- **Dos clases con ventanas solapadas** por configuración errónea → bloquear en alta (constraint) y,
  defensivamente, marcar asistencia ambigua para revisión manual.
- Alumno **sin cuponera alguna** → asiste, se genera deuda.
- **Pase libre vencido** el día de la clase → ya no cubre; cae a packs o deuda.
- **Cuponera con 1 clase y vencimiento hoy** → consumible hoy, no mañana.
- **Confirmar una asistencia ya rechazada** (reapertura) → permitido solo a admin, auditado.
- **Corregir una asistencia de un mes ya cerrado contablemente** → permitir pero alertar (impacto en reportes).
- **Pago cancelado después de haber generado una cuponera ya consumida** → la reversión deja saldo
  negativo/deuda, no borra asistencias.
- **Alumno sin foto** al escanear QR → el verificador muestra placeholder; no bloquea, pero se marca.
- **QR fijo robado/compartido** → mitigación: mostrar foto+nombre al operador; el QR fijo solo genera
  pendientes (nunca confirma ni descuenta solo).
- **Sesión no materializada** (nadie creó la `class_session` del día) → creación perezosa en el check-in.
- **Feriado / clase cancelada** → sesión marcada `cancelled`; check-ins se rechazan o van a revisión.
- **Reloj del cliente adelantado** → se ignora; manda el timestamp del servidor.
- **Alumno dado de baja** que intenta check-in → bloquear con mensaje claro.

---

## 9. Mejoras propuestas (justificadas)

> Solo funcionalidades con valor real para una academia de baile. Marcadas por prioridad.

| # | Mejora | Justificación | Prioridad |
|---|---|---|---|
| 1 | **Verificador visual al escanear (foto + nombre + saldo)** | Mitiga uso indebido del QR y agiliza el control en puerta. Ya pedido implícitamente. | Alta |
| 2 | **Panel de "pendientes antiguas" + recordatorios al profesor** | Evita que asistencias queden sin confirmar y clases sin descontar (problema §7.2). | Alta |
| 3 | **Notificaciones (push PWA / email) de vencimiento de cuponera y deuda** | Retención y cobranza: el alumno renueva a tiempo. Bajo costo con PWA. | Alta |
| 4 | **Reporte de ocupación por clase/estilo/profesor** | Decisiones de negocio: qué clases llenan, qué profesor convoca. | Media |
| 5 | **Auto-renovación / recordatorio de pase libre mensual** | Ingresos recurrentes; reduce fricción administrativa. | Media |
| 6 | **Lista de espera / cupo máximo por sesión** | Si una clase se llena, ordena el ingreso. Solo si hay límite de aforo. | Media (condicional) |
| 7 | **Historial exportable (CSV/PDF) de asistencias y pagos** | Contabilidad y respaldo. | Media |
| 8 | **Multi-salón (room)** | Permite clases simultáneas en distintos salones; hoy bloqueado por la regla de no-solape. Diseñar el modelo para incorporarlo sin migración dolorosa. | Baja (futuro) |
| 9 | **Congelar/pausar cuponera** (vacaciones, lesión) | Común en academias; mejora satisfacción. Se modela como extensión de `valid_to`. | Baja |
| 10 | **Auditoría completa (audit_log)** de toda acción sensible | Confianza, resolución de disputas ("a mí no me descontaron"). | Alta |

**Explícitamente NO incluido ahora** (para no sobre-ingenierizar): pasarela de pago, reservas previas
de cupo, app nativa, multi-sede. Todo queda contemplado en el modelo para no requerir reescritura.

---

## 10. Modos de QR (arquitectura para ambos escenarios)

Se diseñan **dos modos** soportados por el mismo backend. **CONFIRMADO con el negocio: el modo
primario y el que se implementa primero es el Modo A — la academia escanea al alumno.** El Modo B
queda contemplado en la arquitectura para el futuro, pero no es prioridad de la primera versión.

### Modo A — La academia escanea el QR del alumno  ⭐ (MODO PRIMARIO)
- El alumno muestra su **QR fijo** (impreso o en la app).
- Un dispositivo de la academia (tablet en recepción) escanea → backend identifica al alumno →
  muestra **foto + nombre + saldo** al operador → crea asistencia pendiente.
- Ventaja: funciona sin que el alumno tenga la app. Riesgo: QR compartible → mitigado por verificación visual.

### Modo B — El alumno escanea el QR de la academia
- La academia muestra un **QR dinámico** (rotativo, ej. cada 30–60s) en una pantalla.
- El alumno lo escanea desde su app (autenticada) → backend valida token + identidad del alumno → asistencia pendiente.
- Ventaja: el alumno está autenticado (más seguro). Riesgo: requiere app + cámara.

### Seguridad del token dinámico (`qr_token`)
- Token corto, firmado, con `expires_at` (vida 30–90s), `nonce` de un solo uso, ligado a la academia/sesión.
- El **QR fijo** del alumno NO confirma ni descuenta por sí solo: siempre genera *pending* y requiere
  confirmación humana. Así el robo del QR fijo tiene impacto acotado.

---

## 11. Cómo se guardan las fotos (Supabase Storage)

Resumen (detalle en `docs/03-SUPABASE-STORAGE-Y-AUTH.md`):
- Bucket **privado** `student-photos`. Path: `students/{student_id}/{uuid}.webp`.
- El frontend **no sube directo con la anon key**; pide al backend una **URL firmada de subida**
  (o sube vía el backend). El backend valida tamaño/tipo (jpeg/png/webp, ≤ ~2 MB), normaliza a webp.
- Para mostrar, el backend genera **URL firmada de lectura** de corta vida (ej. 5 min).
- Se guarda en `student.photo_path` la ruta del objeto, no una URL pública permanente.
- PDF del QR fijo: bucket `qr-prints`, mismo patrón.

---

## 12. Reglas de negocio (consolidado para implementación)

**Asistencia**
- R1. Ventana de registro: `[hora_fin − 15min, hora_fin + 30min]`.
- R2. Fuera de ventana → `pending` con source `out_of_window_manual`.
- R3. Único registro por (alumno, sesión, fecha) — idempotente.
- R4. Solo la **confirmación** descuenta. Pending/rejected no afectan saldo.
- R5. Confirmar **nunca** se bloquea por falta de saldo (genera deuda).
- R6. Corrección = crédito compensatorio (no edita historia), motivo opcional, auditado.
- R7. Admin puede crear asistencia manual sin check-in.

**Cuponeras**
- R8. Prioridad de consumo: pase libre (no descuenta) → pack (FIFO por vencimiento) → suelta → deuda.
- R9. Vencimiento = **30 días corridos** desde la compra; solo admin extiende (`extension` en ledger + audit).
- R10. Cuponera vencida con saldo no se consume automáticamente.
- R11. Saldo y deuda se derivan del ledger; `pass.balance` es caché desnormalizado consistente por transacción.

**Pagos**
- R12. Manuales. Confirmar pago dispara crédito (cuponera nueva / clase suelta / cancelación de deuda).
- R13. Cancelar pago revierte por compensación, auditado; no borra asistencias.

---

## 13. Autenticación: ¿Supabase Auth o JWT propio?

**Recomendación: Supabase Auth + validación de JWT en .NET.**

| Criterio | Supabase Auth | JWT propio en .NET |
|---|---|---|
| Tiempo de desarrollo | Bajo (login, reset, email listo) | Alto (todo a mano) |
| Recuperación de contraseña, verificación email | Incluido | A construir |
| Integración con Storage/RLS | Nativa (`auth.uid()`) | Manual |
| Control fino de claims/roles | Medio (custom claims) | Total |
| Dependencia de proveedor | Mayor | Menor |

**Decisión:** usar **Supabase Auth** para identidad y emisión de tokens. .NET valida el JWT contra el
**JWKS público** de Supabase y mapea el `sub` (auth user id) a `AppUser`. Los **roles del negocio**
(Admin/Profesor/Alumno) y permisos viven en **nuestras tablas** y los aplica el backend (no se confía
solo en claims del cliente). RLS en Postgres como segunda capa.

*Alternativa* (si se quiere independencia total del proveedor): autenticación propia con ASP.NET
Identity + JWT. Desventaja: reconstruir flujos de email/reset y perder `auth.uid()` para RLS. Solo si
hay requisito explícito de no depender de Supabase para auth.

---

## 14. Próximos pasos sugeridos (sin implementar aún)

1. Validar este análisis con el cliente (sobre todo §3.1 sesión vs. fecha, §13 auth, multi-salón).
2. Cerrar el esquema SQL de `docs/02-ESQUEMA-BD.md`.
3. Definir la grilla de endpoints del Web API.
4. Prototipo de pantalla de check-in con verificador visual.

> **Decisiones de negocio CONFIRMADAS (2026-06-28):**
> - **Una sola sede, un solo salón** → sin clases simultáneas; no se usa `room` para distinguir (§7.1).
> - **La academia escanea al alumno (Modo A)** es el modo primario a implementar (§10).
> - **Pase libre y cuponeras: 30 días corridos** desde la compra (no mes calendario) (§5.2).
