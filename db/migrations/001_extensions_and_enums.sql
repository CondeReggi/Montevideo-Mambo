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
