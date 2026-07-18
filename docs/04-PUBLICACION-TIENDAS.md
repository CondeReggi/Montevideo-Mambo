# 04 — Publicación en Play Store / App Store (informe)

> **Estado: INFORME. No se publica nada.** Este documento releva qué falta, qué
> assets/config se necesitan, riesgos de política y una recomendación. La decisión
> de publicar (y en qué tienda) es del cliente.

> ⚠️ **Recordatorio de arquitectura.** Hoy la app es una **PWA** (Next en Vercel +
> service worker propio + manifest instalable). Empaquetarla para una tienda
> **cambia la naturaleza del producto** y es un **FEATURE APARTE**, con su propio
> proyecto/pipeline/firma — no un ajuste sobre lo actual. Ver la advertencia en
> `NOTAS_CAMBIOS.txt` (backlog PRODUCTO). Este informe describe ese feature; no lo
> ejecuta.

---

## 1. Punto de partida (lo que YA tenemos)

| Elemento | Estado |
|---|---|
| PWA instalable (`manifest.json`, `display: standalone`, colores de marca) | ✅ |
| Service worker (`public/sw.js`): cache del app shell + push | ✅ |
| Íconos 192 y 512 (`any maskable`) | ✅ |
| HTTPS en producción (Vercel) | ✅ (requisito para PWA/TWA) |
| Notificaciones push (Web Push/VAPID) | ✅ (detrás de flag) |
| Cámara para escanear QR | ✅ (permiso del navegador) |

En Android, esta PWA **ya se puede "instalar"** desde Chrome (WebAPK) sin pasar por
ninguna tienda. El problema que motiva ir a la tienda es cosmético/de confianza:
en algunos Android viejos aparece el aviso *"app diseñada para una versión anterior
de Android"* porque la WebAPK la genera Chrome y su `targetSdk` depende del
dispositivo (no se controla desde nuestro código).

---

## 2. Dos caminos posibles

### Camino A — Google Play como **TWA** (recomendado para empezar)
**Trusted Web Activity**: un contenedor Android mínimo que abre nuestro sitio de
Vercel a pantalla completa (sin barra de navegador). Reusa el 100% del front. Se
genera con **Bubblewrap** (CLI de Google) o **PWABuilder**.

- **Costo:** cuenta Google Play Developer, **US$25 pago único**.
- **Entrega:** un `.aab` firmado.
- **Ventaja:** controla `targetSdk` y firma → se instala sin advertencias en
  cualquier Android. Cambios del front salen solos (es el mismo sitio); solo se
  re-sube el `.aab` si cambia el contenedor.

### Camino B — Apple App Store (iOS)
**La PWA sola NO entra a la App Store.** Apple exige un binario nativo. Opciones:
- **Capacitor** (envuelve la web en un `WKWebView` nativo con acceso a plugins), o
- App **nativa** (React Native/Expo) — el bloque grande, ver `PLAN_MOBILE.txt`.

- **Costo:** Apple Developer Program, **US$99/año**.
- **Requiere:** una Mac con Xcode para compilar/firmar, certificados y
  *provisioning profiles*.
- **Push en iOS dentro del wrapper:** requiere APNs; el Web Push del navegador no
  aplica igual dentro de un WKWebView. Es trabajo adicional.

> Este Camino B es exactamente el "feature aparte" de la advertencia PWA.

---

## 3. Qué FALTA antes de empaquetar (checklist)

### 3.1 Requisitos legales / de cuenta (bloqueantes en AMBAS tiendas)
- [ ] **Política de privacidad** pública (URL). Hoy **no existe** una página de
      privacidad/términos. Ambas tiendas la exigen sí o sí. → Crear
      `/privacidad` (y `/terminos`) en el front. Debe declarar: qué datos se
      recogen (nombre, email, teléfono, foto, asistencias, pagos), para qué,
      dónde se guardan (Supabase), y contacto.
- [ ] **Borrado de cuenta in-app** (y/o URL de solicitud de borrado). Google y
      Apple lo exigen desde 2022/2023. Hoy **no existe** un flujo de baja de la
      propia cuenta del usuario (el admin da de baja alumnos, pero el usuario no
      puede borrar su cuenta ni pedirlo). → Agregar en `/settings` un "Eliminar mi
      cuenta" (o un canal claro para solicitarlo) + endpoint backend.
- [ ] **Formulario de datos/seguridad** ("Data safety" en Play, "App Privacy
      Nutrition Labels" en Apple): declarar qué datos se recogen y si se comparten.
- [ ] **Clasificación de contenido** (content rating): cuestionario. Esta app es
      apta para todo público (gestión de academia).

### 3.2 Assets de ficha de tienda (faltan TODOS)
- [ ] **Ícono de tienda** 512×512 (Play) — tenemos `icon-512.png`, sirve de base.
- [ ] **Feature graphic** 1024×500 (Play).
- [ ] **Screenshots** de teléfono (mín. 2; ideal 4–8): login, horarios, panel del
      alumno, check-in QR, novedades. **Faltan.**
- [ ] Screenshots de tablet (si se declara soporte tablet).
- [ ] **Textos de ficha:** título, descripción corta, descripción larga (usar el
      material de `PRESENTACION_PRODUCTO`), en español (UY).
- [ ] (Apple) Screenshots por tamaño de dispositivo requerido + ícono 1024×1024.

### 3.3 Técnico para TWA (Camino A)
- [ ] **Digital Asset Links**: publicar `/.well-known/assetlinks.json` en el sitio
      de Vercel con el fingerprint SHA-256 de la clave de firma de la app. Sin esto
      la TWA muestra la barra del navegador (no queda "full screen"). Hoy **no
      existe** `frontend/public/.well-known/assetlinks.json`.
- [ ] Generar el proyecto con Bubblewrap apuntando a la URL de producción y al
      `manifest.json`.
- [ ] Definir y **resguardar la keystore** de firma (o usar Play App Signing).

### 3.4 Permisos a declarar
- **Notificaciones** (push): ya implementado (Web Push). En TWA se hereda del sitio.
- **Cámara** (escaneo de QR): declarada por el navegador; en TWA/wrapper hay que
  asegurar el prompt de permiso.
- No se usa ubicación GPS, contactos, ni micrófono → menos fricción de revisión.

---

## 4. Riesgos de política (importante)

1. **Pagos (Mercado Pago).** Regla clave: las tiendas obligan a usar su
   facturación **solo para bienes/servicios digitales**. Acá se venden **clases de
   baile presenciales** (servicio del mundo real) → está **permitido** cobrar por
   fuera (Mercado Pago) sin la comisión de la tienda. **Pero:**
   - No mostrar dentro de la app comprada en App Store lenguaje que "esquive" la
     compra in-app para contenido digital.
   - Como el checkout de MP es **redirección al sitio de MP** (Checkout Pro, no un
     SDK embebido), el riesgo es bajo. Mantenerlo así.
2. **Borrado de cuenta ausente** → **rechazo seguro** hasta implementarlo (§3.1).
3. **Política de privacidad ausente** → **rechazo seguro** (§3.1).
4. **Contenido mínimo / "spam app"**: Apple a veces rechaza apps que "son solo un
   sitio web envuelto". La nuestra tiene funcionalidad real (QR, push, paneles), lo
   que reduce el riesgo, pero es un motivo típico de rechazo del **Camino B**.
5. **Cuenta demo para revisión**: ambas tiendas piden un usuario/clave de prueba
   para revisar la app logueada. Preparar un usuario demo estable.

---

## 5. Recomendación

1. **Primero cerrar los bloqueantes legales** (§3.1): política de privacidad,
   términos y **borrado de cuenta**. Son necesarios para *cualquier* tienda y además
   son buena práctica aunque se quede en PWA.
2. **Publicar en Google Play como TWA (Camino A)**: es barato (US$25), reusa el
   front y resuelve el aviso de "versión anterior de Android". Bajo esfuerzo.
3. **Diferir iOS/App Store (Camino B)** hasta que haya demanda real: implica Mac +
   US$99/año + wrapper (Capacitor) o app nativa, y es el **feature aparte** de la
   advertencia PWA. No hacerlo "sobre la marcha".
4. Mientras tanto, la **PWA instalable** cubre a la mayoría de los usuarios sin
   costo ni tienda.

### Orden sugerido de trabajo (cuando el cliente lo pida)
1. Página `/privacidad` + `/terminos`.
2. "Eliminar mi cuenta" en `/settings` + endpoint backend.
3. Screenshots + textos de ficha.
4. TWA con Bubblewrap + `assetlinks.json` + alta en Play Console (US$25).
5. (Futuro, feature aparte) Wrapper iOS + Apple Developer.

---

## 6. Costos resumidos

| Ítem | Costo |
|---|---|
| Google Play Developer | US$25 (pago único) |
| Apple Developer Program | US$99 / año |
| Mac para compilar iOS | según hardware (o servicio de build en la nube) |
| Certificados/keystore | sin costo (gestión propia) |
