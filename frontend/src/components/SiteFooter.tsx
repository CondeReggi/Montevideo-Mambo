import { SITE, SOCIALS } from "@/lib/site";
import {
  IconPin,
  IconPhone,
  IconWhatsapp,
  IconInstagram,
  IconTiktok,
  IconFacebook,
  IconGlobe,
} from "@/components/ui/Icons";

const SOCIAL_ICON: Record<string, React.ReactNode> = {
  whatsapp: <IconWhatsapp />,
  instagram: <IconInstagram />,
  tiktok: <IconTiktok />,
  facebook: <IconFacebook />,
  website: <IconGlobe />,
};

/** Fila de iconos de redes sociales. Renderiza solo las configuradas (lib/site). */
export function SocialLinks({ className = "" }: { className?: string }) {
  if (SOCIALS.length === 0) return null;
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {SOCIALS.map((s) => (
        <a
          key={s.key}
          href={s.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={s.label}
          title={s.label}
          className="grid h-9 w-9 place-items-center rounded-lg border border-ink-500 text-base text-muted-soft transition hover:border-lime/50 hover:text-lime active:scale-95"
        >
          {SOCIAL_ICON[s.key] ?? <IconGlobe />}
        </a>
      ))}
    </div>
  );
}

/**
 * Pie de página de marca: dirección (con link a mapas), teléfono y redes.
 * Centraliza los datos de contacto que antes estaban repetidos en cada página.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-ink-500/50 bg-ink-900/60">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-5 py-7 text-sm text-muted-soft">
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2">
          <a
            href={SITE.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 transition hover:text-lime"
          >
            <IconPin /> {SITE.address}
          </a>
          <a href={SITE.phoneHref} className="inline-flex items-center gap-2 transition hover:text-lime">
            <IconPhone /> {SITE.phoneDisplay}
          </a>
        </div>
        <SocialLinks />
      </div>
    </footer>
  );
}
