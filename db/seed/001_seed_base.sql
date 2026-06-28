-- =====================================================================
-- Seed base — roles y tipos de cuponera
-- Idempotente. Ejecutar después de las migraciones.
-- =====================================================================

-- Roles -----------------------------------------------------------------
insert into role (id, code, name) values
  (1, 'admin',   'Administrador'),
  (2, 'teacher', 'Profesor'),
  (3, 'student', 'Alumno')
on conflict (id) do nothing;

-- Tipos de cuponera (ejemplos) -----------------------------------------
insert into pass_type (name, kind, class_count, price, validity_days, is_active) values
  ('Clase suelta',        'single_class',    1,    350.00, 30, true),
  ('Pack 4 clases',       'class_pack',      4,   1200.00, 30, true),
  ('Pack 8 clases',       'class_pack',      8,   2200.00, 30, true),
  ('Pack 12 clases',      'class_pack',     12,   3000.00, 30, true),
  ('Pase libre mensual',  'unlimited_month', null, 3800.00, 30, true)
on conflict do nothing;
