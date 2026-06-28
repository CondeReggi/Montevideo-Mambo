# Base de datos — Supabase PostgreSQL

Migraciones y seed para el sistema de la academia. Diseño en `../docs/02-ESQUEMA-BD.md`.

## Orden de ejecución

```
migrations/001_extensions_and_enums.sql
migrations/002_tables.sql
migrations/003_indexes_constraints.sql
migrations/004_views_and_triggers.sql
migrations/005_rls.sql
seed/001_seed_base.sql
```

## Cómo aplicarlas

### Opción A — Supabase SQL Editor
Copiar y pegar cada archivo en orden y ejecutar.

### Opción B — psql / connection string
```bash
psql "$SUPABASE_DB_CONNECTION" -f migrations/001_extensions_and_enums.sql
psql "$SUPABASE_DB_CONNECTION" -f migrations/002_tables.sql
psql "$SUPABASE_DB_CONNECTION" -f migrations/003_indexes_constraints.sql
psql "$SUPABASE_DB_CONNECTION" -f migrations/004_views_and_triggers.sql
psql "$SUPABASE_DB_CONNECTION" -f migrations/005_rls.sql
psql "$SUPABASE_DB_CONNECTION" -f seed/001_seed_base.sql
```

## Notas

- Las migraciones son **idempotentes** (`if not exists` / `on conflict`).
- `app_user.id` debe coincidir con `auth.users.id` de Supabase Auth. La FK a `auth.users`
  está comentada en `002_tables.sql`; descomentarla al desplegar en Supabase real.
- `pass.balance` se mantiene automáticamente por trigger desde `pass_ledger_entry`
  (fuente de verdad del saldo).
- RLS está habilitado como defensa en profundidad. El backend .NET escribe con la
  `service_role` key (bypassea RLS) porque ya aplica autorización.

## Verificación rápida (smoke test)

Probar localmente con Docker antes de tocar Supabase:
```bash
docker run --rm -d --name mambo-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16
# esperar a que levante, luego:
for f in migrations/*.sql seed/*.sql; do psql "postgresql://postgres:postgres@localhost:5432/postgres" -f "$f"; done
```
