-- =====================================================================
-- 002 — Tablas
-- Orden de creación respeta dependencias de claves foráneas.
-- Zona horaria de negocio: America/Montevideo (se guarda en UTC).
-- =====================================================================

-- Helper: trigger para updated_at -------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end$$;

-- ---------------------------------------------------------------------
-- app_user : identidad de aplicación, ligada a Supabase Auth (auth.users)
-- ---------------------------------------------------------------------
create table if not exists app_user (
  id          uuid primary key,                 -- = auth.users.id (Supabase Auth)
  email       text not null unique,
  full_name   text not null,
  phone       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on column app_user.id is 'Coincide con auth.users.id de Supabase Auth.';
-- FK opcional a auth.users (descomentar en Supabase real):
-- alter table app_user add constraint fk_app_user_auth
--   foreign key (id) references auth.users(id) on delete cascade;

create or replace trigger trg_app_user_updated before update on app_user
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- role / user_role : roles de negocio (un usuario puede tener varios)
-- ---------------------------------------------------------------------
create table if not exists role (
  id    smallint primary key,
  code  app_role not null unique,
  name  text not null
);

create table if not exists user_role (
  user_id  uuid not null references app_user(id) on delete cascade,
  role_id  smallint not null references role(id) on delete restrict,
  primary key (user_id, role_id)
);

-- ---------------------------------------------------------------------
-- student
-- ---------------------------------------------------------------------
create table if not exists student (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null unique references app_user(id) on delete cascade,
  document_id        text,
  birth_date         date,
  photo_path         text,                       -- ruta en Storage (bucket student-photos)
  qr_fixed_code      text not null unique,        -- código del QR fijo impreso
  emergency_contact  text,
  notes              text,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create or replace trigger trg_student_updated before update on student
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- teacher
-- ---------------------------------------------------------------------
create table if not exists teacher (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references app_user(id) on delete cascade,
  bio         text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create or replace trigger trg_teacher_updated before update on teacher
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- dance_class : plantilla recurrente
-- ---------------------------------------------------------------------
create table if not exists dance_class (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  style       text not null,
  level       text not null,
  weekday     smallint not null check (weekday between 0 and 6),  -- 0=domingo .. 6=sábado
  start_time  time not null,
  end_time    time not null,
  room        text,                              -- una sola sede hoy; previsto multi-sala
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint chk_class_time check (end_time > start_time)
);

create or replace trigger trg_dance_class_updated before update on dance_class
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- class_teacher : N:M clase-profesor
-- ---------------------------------------------------------------------
create table if not exists class_teacher (
  class_id    uuid not null references dance_class(id) on delete cascade,
  teacher_id  uuid not null references teacher(id) on delete cascade,
  primary key (class_id, teacher_id)
);

-- ---------------------------------------------------------------------
-- class_session : instancia concreta por fecha
-- ---------------------------------------------------------------------
create table if not exists class_session (
  id                     uuid primary key default gen_random_uuid(),
  class_id               uuid not null references dance_class(id) on delete cascade,
  session_date           date not null,
  start_at               timestamptz not null,
  end_at                 timestamptz not null,
  status                 text not null default 'scheduled'
                            check (status in ('scheduled', 'cancelled', 'done')),
  substitute_teacher_id  uuid references teacher(id) on delete set null,
  created_at             timestamptz not null default now(),
  constraint uq_session_class_date unique (class_id, session_date),
  constraint chk_session_time check (end_at > start_at)
);

-- ---------------------------------------------------------------------
-- pass_type : catálogo de cuponeras
-- ---------------------------------------------------------------------
create table if not exists pass_type (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  kind           pass_kind not null,
  class_count    int,                            -- N para pack; NULL para pase libre / suelta
  price          numeric(10,2) not null check (price >= 0),
  validity_days  int not null default 30,        -- 30 días corridos desde la compra
  is_active      boolean not null default true
);

-- ---------------------------------------------------------------------
-- pass : cuponera comprada por un alumno
-- ---------------------------------------------------------------------
create table if not exists pass (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references student(id) on delete cascade,
  pass_type_id   uuid not null references pass_type(id) on delete restrict,
  kind           pass_kind not null,             -- snapshot del tipo
  initial_count  int,
  balance        int not null default 0,         -- caché = suma del ledger; puede ser negativo
  valid_from     date not null,
  valid_to       date not null,                  -- valid_from + validity_days (30 días corridos)
  status         pass_status not null default 'active',
  is_paid        boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint chk_pass_validity check (valid_to >= valid_from)
);

create or replace trigger trg_pass_updated before update on pass
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- payment : pago manual
-- ---------------------------------------------------------------------
create table if not exists payment (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references student(id) on delete cascade,
  amount        numeric(10,2) not null check (amount >= 0),
  method        text not null,                   -- efectivo, transferencia, etc.
  status        payment_status not null default 'pending',
  pass_id       uuid references pass(id) on delete set null,
  concept       text,
  paid_at       date,
  confirmed_by  uuid references app_user(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create or replace trigger trg_payment_updated before update on payment
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- attendance : registro de asistencia
-- ---------------------------------------------------------------------
create table if not exists attendance (
  id                   uuid primary key default gen_random_uuid(),
  student_id           uuid not null references student(id) on delete cascade,
  class_session_id     uuid not null references class_session(id) on delete cascade,
  status               attendance_status not null default 'pending',
  source               attendance_source not null,
  checked_in_at        timestamptz not null default now(),
  confirmed_at         timestamptz,
  confirmed_by         uuid references app_user(id) on delete set null,
  pass_id              uuid references pass(id) on delete set null,
  covered_by_unlimited boolean not null default false,
  correction_reason    text,
  is_ambiguous         boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  -- anti-duplicado: un registro por (alumno, sesión)
  constraint uq_attendance_student_session unique (student_id, class_session_id)
);

create or replace trigger trg_attendance_updated before update on attendance
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- pass_ledger_entry : movimientos (fuente de verdad del saldo). Inmutable.
-- ---------------------------------------------------------------------
create table if not exists pass_ledger_entry (
  id             uuid primary key default gen_random_uuid(),
  pass_id        uuid not null references pass(id) on delete cascade,
  delta          int not null,                   -- +créditos / -consumos
  reason         ledger_reason not null,
  attendance_id  uuid references attendance(id) on delete set null,
  payment_id     uuid references payment(id) on delete set null,
  created_by     uuid references app_user(id) on delete set null,
  note           text,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- qr_token : tokens dinámicos de corta vida
-- ---------------------------------------------------------------------
create table if not exists qr_token (
  id                uuid primary key default gen_random_uuid(),
  token             text not null unique,
  purpose           text not null check (purpose in ('academy_display', 'student_checkin')),
  class_session_id  uuid references class_session(id) on delete cascade,
  student_id        uuid references student(id) on delete cascade,
  expires_at        timestamptz not null,
  used_at           timestamptz,
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- audit_log : auditoría de acciones sensibles
-- ---------------------------------------------------------------------
create table if not exists audit_log (
  id             uuid primary key default gen_random_uuid(),
  actor_user_id  uuid references app_user(id) on delete set null,
  action         text not null,
  entity_type    text not null,
  entity_id      uuid not null,
  detail         jsonb,
  created_at     timestamptz not null default now()
);
