-- =============================================================
-- Montevideo MAMBO — esquema completo para Supabase
-- Generado concatenando db/migrations/001..006 + db/seed.
-- NO incluye db/_init/00_auth_stub.sql (Supabase ya tiene auth.uid()).
-- Pegar en Supabase -> SQL Editor -> Run.
-- =============================================================

-- >>>>>>>>>>>>>>>>>>>>>>>>>> db/migrations/001_extensions_and_enums.sql <<<<<<<<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- 001 — Extensiones y tipos enumerados
-- Academia de Baile (APP Montevideo MAMBO)
-- Ejecutar sobre Supabase PostgreSQL (schema public).
-- =====================================================================

-- Extensiones -----------------------------------------------------------
create extension if not exists "pgcrypto";    -- gen_random_uuid()
create extension if not exists "btree_gist";  -- exclusion constraint no-solape

-- Tipo rango de hora (no existe nativo en Postgres) ---------------------
-- Usado por el exclusion constraint de no-solape de clases.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'timerange') then
    create type timerange as range (subtype = time);
  end if;
end$$;

-- Enums -----------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type app_role as enum ('admin', 'teacher', 'student');
  end if;

  if not exists (select 1 from pg_type where typname = 'attendance_status') then
    create type attendance_status as enum ('pending', 'confirmed', 'rejected', 'corrected');
  end if;

  if not exists (select 1 from pg_type where typname = 'attendance_source') then
    create type attendance_source as enum ('qr_student', 'qr_academy', 'manual_admin', 'out_of_window_manual');
  end if;

  if not exists (select 1 from pg_type where typname = 'pass_kind') then
    create type pass_kind as enum ('class_pack', 'unlimited_month', 'single_class');
  end if;

  if not exists (select 1 from pg_type where typname = 'pass_status') then
    create type pass_status as enum ('active', 'expired', 'exhausted', 'cancelled');
  end if;

  if not exists (select 1 from pg_type where typname = 'payment_status') then
    create type payment_status as enum ('pending', 'confirmed', 'cancelled');
  end if;

  if not exists (select 1 from pg_type where typname = 'ledger_reason') then
    create type ledger_reason as enum ('consume', 'purchase_credit', 'manual_adjust', 'extension', 'correction_reverse');
  end if;
end$$;


-- >>>>>>>>>>>>>>>>>>>>>>>>>> db/migrations/002_tables.sql <<<<<<<<<<<<<<<<<<<<<<<<<<
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


-- >>>>>>>>>>>>>>>>>>>>>>>>>> db/migrations/003_indexes_constraints.sql <<<<<<<<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- 003 — Índices y constraints adicionales
-- =====================================================================

-- No-solape de clases (una sola sede/salón): no dos clases activas con
-- mismo weekday y rango horario solapado.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'no_overlap_class'
  ) then
    alter table dance_class
      add constraint no_overlap_class
      exclude using gist (
        weekday with =,
        timerange(start_time, end_time) with &&
      ) where (is_active);
  end if;
end$$;

-- class_session: búsqueda por ventana horaria (consulta caliente del check-in)
create index if not exists idx_class_session_end_at      on class_session(end_at);
create index if not exists idx_class_session_class_date  on class_session(class_id, session_date);

-- attendance
create index if not exists idx_attendance_session_status  on attendance(class_session_id, status);
create index if not exists idx_attendance_student_checked on attendance(student_id, checked_in_at desc);
create index if not exists idx_attendance_status_checked  on attendance(status, checked_in_at);

-- pass / ledger
create index if not exists idx_pass_student_status  on pass(student_id, status);
create index if not exists idx_pass_valid_to        on pass(valid_to);
create index if not exists idx_pass_ledger_pass     on pass_ledger_entry(pass_id);

-- payment
create index if not exists idx_payment_student_status on payment(student_id, status);

-- qr_token
create index if not exists idx_qr_token_expires on qr_token(expires_at);

-- user_role
create index if not exists idx_user_role_user on user_role(user_id);


-- >>>>>>>>>>>>>>>>>>>>>>>>>> db/migrations/004_views_and_triggers.sql <<<<<<<<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- 004 — Vistas derivadas y trigger de saldo
-- =====================================================================

-- ---------------------------------------------------------------------
-- Trigger: mantener pass.balance como caché de la suma del ledger.
-- Garantiza consistencia escriba quien escriba (backend o SQL directo).
-- El saldo SIEMPRE puede reconstruirse desde pass_ledger_entry.
-- ---------------------------------------------------------------------
create or replace function recalc_pass_balance()
returns trigger language plpgsql as $$
declare
  v_pass_id uuid := coalesce(new.pass_id, old.pass_id);
begin
  update pass p
     set balance = coalesce((
           select sum(delta) from pass_ledger_entry e where e.pass_id = v_pass_id
         ), 0)
   where p.id = v_pass_id;
  return null;
end$$;

drop trigger if exists trg_ledger_recalc on pass_ledger_entry;
create trigger trg_ledger_recalc
  after insert or update or delete on pass_ledger_entry
  for each row execute function recalc_pass_balance();

-- ---------------------------------------------------------------------
-- Vista: saldo / deuda por alumno
-- ---------------------------------------------------------------------
create or replace view student_balance as
select
  s.id as student_id,
  s.user_id,
  -- total pagado confirmado
  coalesce((
    select sum(pm.amount) from payment pm
     where pm.student_id = s.id and pm.status = 'confirmed'
  ), 0) as total_paid,
  -- clases restantes en packs activos y vigentes
  coalesce((
    select sum(p.balance) from pass p
     where p.student_id = s.id and p.kind = 'class_pack'
       and p.status = 'active' and p.valid_to >= current_date and p.balance > 0
  ), 0) as classes_remaining,
  -- ¿tiene pase libre vigente?
  exists (
    select 1 from pass p
     where p.student_id = s.id and p.kind = 'unlimited_month'
       and p.status = 'active' and current_date between p.valid_from and p.valid_to
  ) as has_active_unlimited,
  -- deuda en clases: saldos negativos de cuponeras + asistencias confirmadas
  -- NO cubiertas (sin cuponera ni pase libre), i.e. deuda implícita (D12).
  (
    coalesce((
      select -sum(p.balance) from pass p
       where p.student_id = s.id and p.balance < 0
    ), 0)
    + coalesce((
      select count(*) from attendance a
       where a.student_id = s.id and a.status = 'confirmed'
         and a.pass_id is null and a.covered_by_unlimited = false
    ), 0)
  ) as debt_classes,
  -- asistencias pendientes
  coalesce((
    select count(*) from attendance a
     where a.student_id = s.id and a.status = 'pending'
  ), 0) as pending_attendances
from student s;

-- ---------------------------------------------------------------------
-- Vista: asistencias pendientes "antiguas" para alertar (umbral 7 días)
-- ---------------------------------------------------------------------
create or replace view attendance_pending_old as
select a.*, cs.session_date, cs.end_at
from attendance a
join class_session cs on cs.id = a.class_session_id
where a.status = 'pending'
  and a.checked_in_at < now() - interval '7 days';


-- >>>>>>>>>>>>>>>>>>>>>>>>>> db/migrations/005_rls.sql <<<<<<<<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- 005 — Row Level Security (defensa en profundidad)
-- El backend .NET usa la service_role key (bypassea RLS) porque ya
-- aplica autorización. Estas políticas protegen un acceso directo
-- eventual del frontend (lectura del propio alumno).
-- =====================================================================

-- Helper: ¿el usuario actual tiene un rol?
create or replace function auth_has_role(p_code app_role)
returns boolean language sql stable as $$
  select exists (
    select 1 from user_role ur
    join role r on r.id = ur.role_id
    where ur.user_id = auth.uid() and r.code = p_code
  );
$$;

-- Helper: student_id del usuario actual
create or replace function auth_student_id()
returns uuid language sql stable as $$
  select id from student where user_id = auth.uid();
$$;

-- Habilitar RLS en todas las tablas de negocio --------------------------
alter table app_user          enable row level security;
alter table student           enable row level security;
alter table teacher           enable row level security;
alter table dance_class       enable row level security;
alter table class_session     enable row level security;
alter table pass              enable row level security;
alter table pass_ledger_entry enable row level security;
alter table attendance        enable row level security;
alter table payment           enable row level security;

-- Lecturas del propio alumno -------------------------------------------
drop policy if exists pol_student_self on student;
create policy pol_student_self on student
  for select using (user_id = auth.uid() or auth_has_role('admin') or auth_has_role('teacher'));

drop policy if exists pol_pass_self on pass;
create policy pol_pass_self on pass
  for select using (student_id = auth_student_id() or auth_has_role('admin') or auth_has_role('teacher'));

drop policy if exists pol_payment_self on payment;
create policy pol_payment_self on payment
  for select using (student_id = auth_student_id() or auth_has_role('admin'));

drop policy if exists pol_attendance_self on attendance;
create policy pol_attendance_self on attendance
  for select using (
    student_id = auth_student_id() or auth_has_role('admin') or auth_has_role('teacher')
  );

-- Catálogos legibles para usuarios autenticados ------------------------
drop policy if exists pol_class_read on dance_class;
create policy pol_class_read on dance_class
  for select using (auth.uid() is not null);

drop policy if exists pol_session_read on class_session;
create policy pol_session_read on class_session
  for select using (auth.uid() is not null);

-- NOTA: ninguna política de INSERT/UPDATE/DELETE para clientes.
-- Toda escritura pasa exclusivamente por el backend .NET (service_role).


-- >>>>>>>>>>>>>>>>>>>>>>>>>> db/migrations/006_auth.sql <<<<<<<<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- 006 — Autenticación propia (JWT)
-- Agrega hash de contraseña a app_user. Para usuarios gestionados por
-- Supabase Auth, password_hash queda NULL.
-- =====================================================================

alter table app_user add column if not exists password_hash text;


-- >>>>>>>>>>>>>>>>>>>>>>>>>> db/seed/001_seed_base.sql <<<<<<<<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- Seed base — roles y tipos de cuponera
-- Idempotente. Ejecutar después de las migraciones.
-- =====================================================================

-- Roles -----------------------------------------------------------------
insert into role (id, code, name) values
  (1, 'admin',   'Administrador'),
  (2, 'teacher', 'Profesor'),
  (3, 'student', 'Alumno')
on conflict (id) do nothing;

-- Tipos de cuponera (ejemplos) -----------------------------------------
insert into pass_type (name, kind, class_count, price, validity_days, is_active) values
  ('Clase suelta',        'single_class',    1,    350.00, 30, true),
  ('Pack 4 clases',       'class_pack',      4,   1200.00, 30, true),
  ('Pack 8 clases',       'class_pack',      8,   2200.00, 30, true),
  ('Pack 12 clases',      'class_pack',     12,   3000.00, 30, true),
  ('Pase libre mensual',  'unlimited_month', null, 3800.00, 30, true)
on conflict do nothing;


