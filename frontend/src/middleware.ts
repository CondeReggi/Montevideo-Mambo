import { NextRequest, NextResponse } from "next/server";

/**
 * SEC-21 / mitigación de SEC-06: Content-Security-Policy estricta con nonce por request.
 *
 * El objetivo es que un XSS NO pueda ejecutar scripts inyectados (y por ende no pueda
 * robar el token de sesión de localStorage). Se usa nonce + 'strict-dynamic': solo corren
 * los scripts que llevan el nonce del request (los propios de Next.js y el inline de PWA),
 * y los que ellos carguen. NO se permite 'unsafe-inline' para scripts.
 *
 * connect-src incluye el backend .NET (y Supabase si está configurado) porque el front
 * hace fetch a esos orígenes. img-src admite data:/blob: por los QR (QRCode.toDataURL) y el
 * SVG embebido de estilos. style-src permite 'unsafe-inline' (estilos de Tailwind/Next y
 * atributos style="…"): el riesgo de inyección por estilos es muy menor al de scripts.
 */
export function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5080";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: ${supabaseUrl}`.trim(),
    `font-src 'self'`,
    `connect-src 'self' ${apiUrl} ${supabaseUrl}`.trim(),
    `media-src 'self' blob:`,
    `worker-src 'self'`,
    `manifest-src 'self'`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `object-src 'none'`,
    `upgrade-insecure-requests`,
  ].join("; ");

  // Next.js lee el nonce desde la cabecera CSP del REQUEST para aplicarlo a sus scripts.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  // CSP en la RESPUESTA (la que aplica el navegador) + cabeceras de seguridad extra.
  response.headers.set("content-security-policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Permissions-Policy", "camera=(self), microphone=(), geolocation=()");

  return response;
}

export const config = {
  // Aplicar a las páginas HTML; excluir assets estáticos que no necesitan CSP.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|icon-192.png|icon-512.png).*)",
  ],
};
