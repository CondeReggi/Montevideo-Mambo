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
