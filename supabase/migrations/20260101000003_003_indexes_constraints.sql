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
