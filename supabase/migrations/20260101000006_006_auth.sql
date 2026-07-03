-- =====================================================================
-- 006 — Autenticación propia (JWT)
-- Agrega hash de contraseña a app_user. Para usuarios gestionados por
-- Supabase Auth, password_hash queda NULL.
-- =====================================================================

alter table app_user add column if not exists password_hash text;
