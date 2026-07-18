// Configuración centralizada de la MARCA y sus enlaces (contacto + redes).
// Único lugar donde viven la dirección, el teléfono y las redes sociales.
// Cambiá los valores acá (o por variables NEXT_PUBLIC_* en el build) y se
// actualiza en toda la app (home, horarios, footer, etc.).
//
// Redes: se muestran SOLO las que tengan URL cargada (mismo criterio que Mercado
// Pago: "la integración está lista, aparece cuando se configura"). WhatsApp sale
// solo, derivado del teléfono. Las demás se cargan cuando el cliente pase sus
// enlaces reales (por eso quedan vacías por defecto: no inventamos cuentas).

const env = (v: string | undefined) => (v && v.trim() ? v.trim() : "");

// Teléfono de la academia (formato local UY).
const PHONE_DISPLAY = "092 136 401";
// Mismo número en formato internacional para tel: y wa.me (UY = +598, sin el 0).
const PHONE_E164 = "59892136401";

export const SITE = {
  name: "Montevideo Mambo",
  slogan: "BAILÁ · CONECTÁ · DISFRUTÁ",
  address: "Pablo de María 1474 esq. Brandzen",
  city: "Montevideo, Uruguay",
  phoneDisplay: PHONE_DISPLAY,
  phoneHref: `tel:+${PHONE_E164}`,
  // Link a Google Maps con la dirección de la academia (Tarea 9 — ubicación).
  mapsUrl:
    env(process.env.NEXT_PUBLIC_MAPS_URL) ||
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      "Pablo de María 1474 esq. Brandzen, Montevideo, Uruguay",
    )}`,
} as const;

export interface SocialLink {
  key: string;
  label: string;
  href: string;
}

// Orden de aparición. Cada red se incluye solo si tiene URL (env var o default).
const SOCIAL_DEFS: Array<{ key: string; label: string; href: string }> = [
  {
    key: "whatsapp",
    label: "WhatsApp",
    // Derivado del teléfono real → siempre disponible.
    href: env(process.env.NEXT_PUBLIC_WHATSAPP_URL) || `https://wa.me/${PHONE_E164}`,
  },
  { key: "instagram", label: "Instagram", href: env(process.env.NEXT_PUBLIC_INSTAGRAM_URL) },
  { key: "tiktok", label: "TikTok", href: env(process.env.NEXT_PUBLIC_TIKTOK_URL) },
  { key: "facebook", label: "Facebook", href: env(process.env.NEXT_PUBLIC_FACEBOOK_URL) },
  { key: "website", label: "Sitio web", href: env(process.env.NEXT_PUBLIC_WEBSITE_URL) },
];

/** Redes con enlace cargado, en orden. Vacío si no se configuró ninguna. */
export const SOCIALS: SocialLink[] = SOCIAL_DEFS.filter((s) => s.href !== "");
