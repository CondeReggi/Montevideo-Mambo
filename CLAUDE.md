# CLAUDE.md

Guía para Claude Code al trabajar en este proyecto. Léela antes de proponer cambios.

## Qué es este proyecto

**APP Montevideo MAMBO** — Sistema de gestión integral para una academia de baile: alumnos,
profesores, clases, asistencia por QR, cuponeras, pagos y deudas. App web responsive, preparada
para PWA/app nativa a futuro.

**Estado actual: FASE DE DISEÑO. Todavía NO se escribe código de la aplicación.** Toda la carpeta
es documentación de análisis. No crear proyectos de código (frontend/backend) hasta que el cliente
lo apruebe explícitamente.

## Stack objetivo (cuando se implemente)

- **Frontend:** React / Next.js (responsive + PWA).
- **Backend:** .NET 8 Web API — es la **única autoridad de escritura de negocio**.
- **Base de datos:** Supabase PostgreSQL.
- **Storage:** Supabase Storage (fotos de alumnos, QR imprimibles) — buckets privados + signed URLs.
- **Auth:** Supabase Auth para identidad/JWT, validado en .NET. Roles de negocio en tablas propias.
- **No usar** Firebase ni NoSQL (la lógica es relacional). No implementar pasarela de pago.

## Estructura de la carpeta

```
README.md            Índice y resumen del proyecto.
CLAUDE.md            Este archivo.
NOTAS_CAMBIOS.txt    Bitácora de cambios/decisiones grandes (MANTENER ACTUALIZADA).
docs/
  01-ANALISIS-Y-ARQUITECTURA.md   Dominio, arquitectura, flujos, casos borde, mejoras.
  02-ESQUEMA-BD.md                Tablas, PK/FK, índices, vistas, RLS, reglas transaccionales.
  03-SUPABASE-STORAGE-Y-AUTH.md   Fotos en Storage + decisión de auth.
```

## Decisiones de negocio CONFIRMADAS (no re-litigar sin avisar)

- **Una sola sede / un solo salón.** Sin clases simultáneas; la regla de no-solape es solo
  (weekday + rango horario), sin dimensión `room`. `room` queda previsto para multi-sala futura.
- **La academia escanea al alumno (Modo A) es el modo primario** de QR a implementar primero.
  El Modo B (alumno escanea a la academia) queda contemplado pero no es prioridad.
- **Vencimiento = 30 días corridos** desde la compra (NO mes calendario), para packs y pase libre.

## Reglas de negocio núcleo (no romper)

- **Asistencia por ventana horaria:** `[hora_fin − 15min, hora_fin + 30min]`. Fuera de ventana →
  pendiente manual para revisión, nunca se descarta.
- **El descuento de clases ocurre SOLO al confirmar** la asistencia (no al check-in).
- **Nunca impedir asistir por falta de saldo** → si no hay saldo, se confirma igual y queda deuda
  (ledger negativo).
- **Cuponeras con ledger de movimientos** (`pass_ledger_entry`), no contador simple. `pass.balance`
  es solo caché desnormalizado, consistente dentro de la misma transacción que el ledger.
- **Correcciones son reversibles por compensación** (nueva fila de ledger), nunca editan historia.
- **Prioridad de consumo:** pase libre (no descuenta) → pack (FIFO por vencimiento) → clase suelta → deuda.
- **Anti-duplicado:** único registro por (alumno, sesión).
- **Auditoría** (`audit_log`) en toda acción sensible: confirmar, corregir, extender, cancelar pago.

## Roles

- **Administrador:** acceso total.
- **Profesor:** ve todas las clases; confirma y corrige asistencias (motivo opcional).
- **Alumno:** autogestión (cuponeras, clases consumidas, historial, asistencias, pagos, deudas).

## Convenciones de trabajo en este repo

- **Idioma:** toda la documentación y comunicación en **español**.
- **Zona horaria de negocio:** `America/Montevideo`. Almacenar en UTC, calcular ventanas en el backend
  (nunca confiar en el reloj del cliente).
- **Bitácora:** ante cualquier cambio o decisión GRANDE, agregar una entrada datada en
  `NOTAS_CAMBIOS.txt` (instrucción explícita del usuario).
- **BD:** `snake_case`, PK `uuid` (`gen_random_uuid()`), timestamps `timestamptz`.
- No agregar funcionalidades complejas sin justificarlas. Ante ambigüedades, proponer alternativas
  con ventajas/desventajas antes de implementar.

## Próximos pasos posibles (sólo si el usuario lo pide)

1. Cerrar el esquema SQL definitivo y migraciones para Supabase.
2. Definir la grilla de endpoints del Web API .NET 8.
3. Prototipo de pantalla de check-in con verificador visual (foto + nombre + saldo).
