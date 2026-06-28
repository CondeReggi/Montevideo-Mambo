-- =====================================================================
-- Stub de Supabase Auth para PostgreSQL LOCAL (desarrollo).
-- En Supabase real, el schema `auth` y `auth.uid()` ya existen; este
-- archivo NO debe aplicarse allí (solo se monta en docker-compose local).
-- Permite que 005_rls.sql cree políticas que referencian auth.uid().
-- =====================================================================

create schema if not exists auth;

create or replace function auth.uid()
returns uuid language sql stable as $$
  select null::uuid;
$$;
