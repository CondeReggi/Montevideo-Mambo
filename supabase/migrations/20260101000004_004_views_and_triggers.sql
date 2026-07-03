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
