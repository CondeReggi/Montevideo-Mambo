# Esquema de Base de Datos — Supabase PostgreSQL

> Propuesta de esquema. Aún **no se ejecuta**; es el diseño para revisar antes de crear migraciones.
> Convenciones: `snake_case`, PK `uuid` (`gen_random_uuid()`), timestamps `timestamptz` en UTC,
> zona de negocio `America/Montevideo`. Todas las tablas en schema `public`.

---

## 1. Tipos enumerados

```
attendance_status   : pending | confirmed | rejected | corrected
attendance_source   : qr_student | qr_academy | manual_admin | out_of_window_manual
pass_kind           : class_pack | unlimited_month | single_class
pass_status         : active | expired | exhausted | cancelled
payment_status      : pending | confirmed | cancelled
ledger_reason       : consume | purchase_credit | manual_adjust | extension | correction_reverse
app_role            : admin | teacher | student
```

---

## 2. Tablas (definición lógica)

### 2.1 `app_user`
Identidad de aplicación, vinculada a Supabase Auth.

| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | = `auth.users.id` (mismo id que Supabase Auth) |
| email | text UNIQUE NOT NULL | |
| full_name | text NOT NULL | |
| phone | text | |
| is_active | bool NOT NULL default true | baja lógica |
| created_at | timestamptz NOT NULL default now() | |
| updated_at | timestamptz NOT NULL default now() | |

### 2.2 `role` y `user_role`
```
role(id smallint PK, code app_role UNIQUE, name text)
user_role(user_id uuid FK→app_user.id, role_id smallint FK→role.id,
          PK(user_id, role_id))
```
Un usuario puede tener varios roles (ej. profesor que también es admin).

### 2.3 `student`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK→app_user.id UNIQUE NOT NULL | 1:1 con usuario |
| document_id | text | cédula/identificación, opcional |
| birth_date | date | |
| photo_path | text | ruta en Storage (bucket student-photos) |
| qr_fixed_code | text UNIQUE NOT NULL | código del QR fijo impreso |
| emergency_contact | text | |
| notes | text | |
| is_active | bool NOT NULL default true | |
| created_at / updated_at | timestamptz | |

### 2.4 `teacher`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK→app_user.id UNIQUE NOT NULL | |
| bio | text | |
| is_active | bool NOT NULL default true | |
| created_at / updated_at | timestamptz | |

### 2.5 `dance_class` (plantilla recurrente)
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| name | text NOT NULL | |
| style | text NOT NULL | estilo (salsa, bachata, etc.) |
| level | text NOT NULL | nivel |
| weekday | smallint NOT NULL | 0=domingo … 6=sábado |
| start_time | time NOT NULL | hora inicio |
| end_time | time NOT NULL | hora fin |
| room | text | salón. **Hoy: una sola sede/salón** → valor fijo o NULL; previsto para multi-sala futura |
| is_active | bool NOT NULL default true | |
| created_at / updated_at | timestamptz | |

Constraint: `CHECK (end_time > start_time)`.
Regla de **no-solape** (ver §4).

### 2.6 `class_teacher` (N:M)
```
class_teacher(class_id uuid FK→dance_class.id,
              teacher_id uuid FK→teacher.id,
              PK(class_id, teacher_id))
```

### 2.7 `class_session` (instancia por fecha)
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| class_id | uuid FK→dance_class.id NOT NULL | |
| session_date | date NOT NULL | fecha concreta |
| start_at | timestamptz NOT NULL | inicio real (date + start_time en zona) |
| end_at | timestamptz NOT NULL | fin real |
| status | text NOT NULL default 'scheduled' | scheduled \| cancelled \| done |
| substitute_teacher_id | uuid FK→teacher.id | suplencia puntual, opcional |
| created_at | timestamptz | |

Unique: `(class_id, session_date)`.
Ventana de check-in derivada: `[end_at − 15min, end_at + 30min]`.

### 2.8 `pass_type` (catálogo de cuponeras)
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| name | text NOT NULL | "Pack 10 clases", "Pase libre", "Clase suelta" |
| kind | pass_kind NOT NULL | |
| class_count | int | NULL si pase libre/suelta variable; para pack = N |
| price | numeric(10,2) NOT NULL | |
| validity_days | int NOT NULL default 30 | duración = **30 días corridos** desde la compra (confirmado) |
| is_active | bool NOT NULL default true | |

### 2.9 `pass` (cuponera comprada por un alumno)
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| student_id | uuid FK→student.id NOT NULL | |
| pass_type_id | uuid FK→pass_type.id NOT NULL | |
| kind | pass_kind NOT NULL | copiado del type (snapshot) |
| initial_count | int | clases iniciales (pack) |
| balance | int NOT NULL default 0 | **caché** = suma del ledger; puede ser negativo |
| valid_from | date NOT NULL | |
| valid_to | date NOT NULL | vencimiento |
| status | pass_status NOT NULL default 'active' | |
| is_paid | bool NOT NULL default false | si el pago asociado fue confirmado |
| created_at / updated_at | timestamptz | |

Para `unlimited_month`: `balance`/`initial_count` se ignoran (no descuenta); vigencia por fechas.

### 2.10 `pass_ledger_entry` (movimientos, fuente de verdad del saldo)
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| pass_id | uuid FK→pass.id NOT NULL | |
| delta | int NOT NULL | +créditos / −consumos (en "clases") |
| reason | ledger_reason NOT NULL | |
| attendance_id | uuid FK→attendance.id | si reason=consume/correction_reverse |
| payment_id | uuid FK→payment.id | si reason=purchase_credit |
| created_by | uuid FK→app_user.id | actor |
| note | text | motivo opcional |
| created_at | timestamptz NOT NULL default now() | inmutable |

Regla: filas inmutables. Correcciones = nueva fila compensatoria.
`pass.balance` = `SUM(delta)` por `pass_id` (mantener por transacción/trigger).

### 2.11 `attendance`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| student_id | uuid FK→student.id NOT NULL | |
| class_session_id | uuid FK→class_session.id NOT NULL | |
| status | attendance_status NOT NULL default 'pending' | |
| source | attendance_source NOT NULL | |
| checked_in_at | timestamptz NOT NULL | timestamp del servidor al registrar |
| confirmed_at | timestamptz | cuando un profesor confirmó |
| confirmed_by | uuid FK→app_user.id | |
| pass_id | uuid FK→pass.id | cuponera consumida (NULL si pase libre o deuda) |
| covered_by_unlimited | bool NOT NULL default false | true si lo cubrió un pase libre |
| correction_reason | text | opcional |
| is_ambiguous | bool NOT NULL default false | solape/detección dudosa |
| created_at / updated_at | timestamptz | |

**Unicidad (anti-duplicado):** `UNIQUE (student_id, class_session_id)`.
(La fecha está implícita en la sesión, por eso basta con sesión + alumno.)

### 2.12 `payment`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| student_id | uuid FK→student.id NOT NULL | |
| amount | numeric(10,2) NOT NULL | |
| method | text NOT NULL | efectivo, transferencia, etc. |
| status | payment_status NOT NULL default 'pending' | |
| pass_id | uuid FK→pass.id | si el pago compra/abona una cuponera |
| concept | text | descripción |
| paid_at | date | fecha del pago real |
| confirmed_by | uuid FK→app_user.id | |
| created_at / updated_at | timestamptz | |

### 2.13 `qr_token` (tokens dinámicos)
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| token | text UNIQUE NOT NULL | valor firmado/aleatorio |
| purpose | text NOT NULL | academy_display \| student_checkin |
| class_session_id | uuid FK→class_session.id | si liga a sesión |
| student_id | uuid FK→student.id | si es del alumno |
| expires_at | timestamptz NOT NULL | vida corta (30–90s) |
| used_at | timestamptz | single-use |
| created_at | timestamptz | |

### 2.14 `audit_log`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| actor_user_id | uuid FK→app_user.id | |
| action | text NOT NULL | confirm_attendance, correct_attendance, extend_pass, cancel_payment… |
| entity_type | text NOT NULL | attendance, pass, payment… |
| entity_id | uuid NOT NULL | |
| detail | jsonb | snapshot/motivo |
| created_at | timestamptz NOT NULL default now() | |

---

## 3. Vistas derivadas

### 3.1 `student_balance` (deuda/saldo)
Por alumno:
- `total_paid` = SUM(payment.amount where status=confirmed)
- `classes_remaining` = SUM(pass.balance where status=active, kind=class_pack)
- `has_active_unlimited` = EXISTS pase libre vigente
- `debt_classes` = −SUM(pass.balance where balance<0)
- `pending_attendances` = COUNT(attendance where status=pending)

### 3.2 `attendance_pending_old`
Asistencias `pending` con `checked_in_at < now() − N días` para alertar al admin/profesor.

---

## 4. Constraint de no-solape de clases

Requisito: "no pueden existir dos clases en el mismo horario".
**CONFIRMADO: una sola sede/salón** → la interpretación se simplifica: no dos `dance_class` activas con
**mismo weekday y rango horario solapado** (sin dimensión `room`).

Opciones de implementación:
- **A) Exclusion constraint con `timerange` + `btree_gist`** sobre (weekday, rango horario).
  Ventaja: lo garantiza la BD. Recomendado.
- **B) Validación solo en backend.** Más simple pero permite condiciones de carrera.

Recomendado: **A** para integridad fuerte; el backend además valida para dar mensajes claros.
*Nota multi-sala futura:* si algún día hay varios salones, agregar `room` a la clave del exclusion
constraint y permitir solapes entre salas distintas.

---

## 5. Índices necesarios

```
-- Búsqueda de sesión por ventana horaria (consulta caliente del check-in)
idx_class_session_end_at            ON class_session(end_at)
idx_class_session_class_date        ON class_session(class_id, session_date)

-- Asistencias
uq_attendance_student_session       UNIQUE ON attendance(student_id, class_session_id)
idx_attendance_session_status       ON attendance(class_session_id, status)   -- lista de la clase
idx_attendance_student_checked      ON attendance(student_id, checked_in_at DESC) -- historial
idx_attendance_status_checked       ON attendance(status, checked_in_at)      -- pendientes antiguas

-- Cuponeras
idx_pass_student_status             ON pass(student_id, status)
idx_pass_valid_to                   ON pass(valid_to)                          -- vencimientos / job
idx_pass_ledger_pass               ON pass_ledger_entry(pass_id)

-- Pagos
idx_payment_student_status          ON payment(student_id, status)

-- QR
uq_qr_token_token                   UNIQUE ON qr_token(token)
idx_qr_token_expires                ON qr_token(expires_at)
uq_student_qr_fixed                 UNIQUE ON student(qr_fixed_code)

-- Roles / usuarios
idx_user_role_user                  ON user_role(user_id)
uq_app_user_email                   UNIQUE ON app_user(email)
```

---

## 6. Reglas de integridad transaccional (a aplicar en backend .NET)

1. **Confirmar asistencia** (transacción atómica):
   - `attendance.status pending → confirmed`, set `confirmed_at/by`.
   - elegir cuponera (R8): si pase libre → `covered_by_unlimited=true`, sin ledger.
   - si pack/suelta → `pass_ledger_entry(delta=-1, reason=consume)` + actualizar `pass.balance`.
   - si sin saldo → ledger negativo / registro de deuda.
   - `audit_log`.
2. **Corregir** (transacción): `confirmed → corrected`; si hubo consumo, `pass_ledger_entry(delta=+1,
   reason=correction_reverse)`; `audit_log`.
3. **Extender cuponera**: update `valid_to`; `pass_ledger_entry(reason=extension)` opcional informativo;
   `audit_log`.
4. **Confirmar pago**: `payment.status → confirmed`; crear `pass` y/o `pass_ledger_entry
   (reason=purchase_credit)`; `audit_log`.

> El cálculo del saldo SIEMPRE puede reconstruirse desde `pass_ledger_entry`. `pass.balance` es solo
> caché para lecturas rápidas y debe actualizarse dentro de la misma transacción que inserta el ledger.

---

## 7. RLS (Row Level Security) — defensa en profundidad

- Habilitar RLS en todas las tablas.
- El backend .NET usa la **service role key** (bypassea RLS) porque ya aplica autorización.
- Políticas para acceso directo eventual del frontend (solo lectura del propio alumno):
  - `student` / `attendance` / `pass` / `payment`: `student.user_id = auth.uid()` para SELECT del propio.
  - Profesores: SELECT de asistencias de cualquier sesión.
  - Admin: full (via claim/rol).
- Escrituras sensibles: **denegadas** vía RLS para clientes; solo el backend escribe.
