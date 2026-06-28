# Frontend — Academia de Baile (Next.js)

App web responsive, preparada para PWA. Consume el backend .NET y usa Supabase Auth para login.

## Stack
- Next.js 14 (App Router) + TypeScript + Tailwind CSS.
- `@supabase/supabase-js` (solo autenticación).
- `html5-qrcode` (escaneo de QR por cámara en recepción).

## Configuración
Copiar `.env.local.example` a `.env.local` y completar:
```
NEXT_PUBLIC_API_URL=http://localhost:5080
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

## Comandos
```bash
npm install
npm run dev      # desarrollo en http://localhost:3000
npm run build    # build de producción
```

## Estructura
```
src/
  app/
    page.tsx            Landing con accesos por rol
    checkin/page.tsx    Check-in de recepción (modo primario: escanea al alumno)
  components/
    QrScanner.tsx       Escáner de QR por cámara (carga dinámica, sin SSR)
  lib/
    supabase.ts         Cliente Supabase (lazy) + obtención del JWT
    api.ts              Cliente del backend .NET (adjunta Bearer JWT)
public/
  manifest.json         Manifiesto PWA
```

## Implementado (primera iteración)
- Pantalla de **check-in**: escaneo por cámara o ingreso manual del código del QR fijo,
  llamada al backend y feedback (ok / observación / error, idempotencia).

## Pendiente
- Iconos PWA (`public/icon-192.png`, `icon-512.png`) y service worker para instalación offline.
- Login con Supabase Auth y guard por rol.
- Verificación visual en check-in: foto + nombre + saldo del alumno (requiere endpoint del backend).
- Paneles de alumno, profesor y administración.
