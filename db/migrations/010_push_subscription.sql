-- ==========================================================================
-- 010_push_subscription.sql
-- Suscripciones Web Push (VAPID). Cada dispositivo/navegador de un usuario es una
-- fila. El endpoint es único: re-suscribir actualiza la fila (no duplica). Las
-- vencidas (404/410) las borra el backend solo al enviar. Idempotente.
-- ==========================================================================

create table if not exists push_subscription (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references app_user(id) on delete cascade,
  -- URL del navegador a la que se envía el push (anclaje de idempotencia).
  endpoint       text not null,
  -- Claves del cliente para cifrar el payload (aes128gcm).
  p256dh         text not null,
  auth           text not null,
  user_agent     text,
  created_at     timestamptz not null default now(),
  last_used_at   timestamptz not null default now(),
  failure_count  integer not null default 0
);

-- Endpoint único: un dispositivo = una fila; re-suscribir hace UPDATE.
create unique index if not exists uq_push_subscription_endpoint on push_subscription (endpoint);
-- Para enviar a todas las suscripciones de un usuario.
create index if not exists idx_push_subscription_user on push_subscription (user_id);

-- RLS: defensa en profundidad. El backend .NET es la única autoridad de escritura.
alter table push_subscription enable row level security;
