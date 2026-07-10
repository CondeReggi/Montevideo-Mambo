-- =====================================================================
-- 007 — Refresh tokens (renovación de sesión sin re-login)
-- El backend .NET guarda SOLO el hash (SHA-256) del token opaco; el valor
-- en claro vive únicamente en el cliente. Rotación con detección de reuso.
-- =====================================================================

create table if not exists refresh_token (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references app_user(id) on delete cascade,
  token_hash             text not null unique,
  expires_at             timestamptz not null,
  created_at             timestamptz not null default now(),
  revoked_at             timestamptz,
  replaced_by_token_hash text
);

create index if not exists ix_refresh_token_user    on refresh_token(user_id);
create index if not exists ix_refresh_token_expires on refresh_token(expires_at);

-- RLS: solo el backend (service_role, que bypassea RLS) toca esta tabla.
-- Sin políticas => cualquier acceso directo del cliente queda denegado por defecto.
alter table refresh_token enable row level security;
