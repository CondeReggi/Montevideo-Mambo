-- ==========================================================================
-- 008_payment_intent.sql
-- Compra de cuponeras por pasarela (Mercado Pago, Checkout Pro).
-- Reemplaza la decisión [D7] (pagos 100% manuales) -> ver [D19] en NOTAS_CAMBIOS.
-- Idempotente: se puede reejecutar sin romper nada.
-- ==========================================================================

-- Estados del intento (espejan los de Mercado Pago).
do $$
begin
  if not exists (select 1 from pg_type where typname = 'payment_intent_status') then
    create type payment_intent_status as enum ('pending', 'approved', 'rejected', 'cancelled');
  end if;
end $$;

create table if not exists payment_intent (
  id                   uuid primary key default gen_random_uuid(),
  student_id           uuid not null references student(id) on delete cascade,
  pass_type_id         uuid not null references pass_type(id) on delete restrict,
  -- Precio del catálogo CONGELADO al iniciar el checkout: es la fuente de verdad del
  -- importe. Nunca se acepta un monto informado por el cliente.
  amount               numeric(10,2) not null check (amount >= 0),
  status               payment_intent_status not null default 'pending',
  preference_id        text,
  -- Id del pago en Mercado Pago. Ancla de IDEMPOTENCIA: ver el índice único de abajo.
  external_payment_id  text,
  pass_id              uuid references pass(id) on delete set null,
  payment_id           uuid references payment(id) on delete set null,
  failure_reason       text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- IDEMPOTENCIA ANTE WEBHOOKS REPETIDOS: Mercado Pago reintenta la notificación ante
-- cualquier error o timeout (y el backend en Render free puede tardar en despertar).
-- Este unique es la garantía DURA de que un pago se procesa UNA sola vez: la guarda de
-- la aplicación puede perder una carrera entre dos webhooks simultáneos, esta no.
-- Los NULL no chocan entre sí en Postgres, así que los intentos aún sin pagar conviven.
create unique index if not exists uq_payment_intent_external
  on payment_intent (external_payment_id)
  where external_payment_id is not null;

create index if not exists idx_payment_intent_student_status
  on payment_intent (student_id, status);

drop trigger if exists trg_payment_intent_updated on payment_intent;
create trigger trg_payment_intent_updated
  before update on payment_intent
  for each row execute function set_updated_at();

-- RLS: defensa en profundidad. El backend .NET sigue siendo la única autoridad de
-- escritura; acá no se define ninguna política (nadie llega directo por PostgREST).
alter table payment_intent enable row level security;
