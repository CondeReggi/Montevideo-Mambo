-- ==========================================================================
-- 009_content.sql
-- Contenidos de difusión: noticias, novedades, muestras, talleres, eventos.
-- Administración los crea/edita/publica; el alumno ve solo lo publicado.
-- Idempotente.
-- ==========================================================================

create table if not exists content (
  id                uuid primary key default gen_random_uuid(),
  -- Tipo como TEXTO (no enum de PG): evita el CREATE TYPE y las etiquetas snake_case
  -- de los enums (fix F6). Valores: News, Update, Showcase, Workshop, Event.
  type              text not null,
  title             text not null,
  body              text,
  image_path        text,                    -- ruta en Supabase Storage (signed URL)
  event_date        date,
  external_url      text,
  -- Ubicación opcional (talleres/muestras/eventos): abrir en Google/Apple Maps.
  location_name     text,
  location_address  text,
  latitude          double precision,
  longitude         double precision,
  is_published      boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- El listado del alumno filtra por is_published (y a veces por tipo).
create index if not exists idx_content_published_type on content (is_published, type);

drop trigger if exists trg_content_updated on content;
create trigger trg_content_updated
  before update on content
  for each row execute function set_updated_at();

-- RLS: defensa en profundidad. El backend .NET es la única autoridad de escritura.
alter table content enable row level security;
