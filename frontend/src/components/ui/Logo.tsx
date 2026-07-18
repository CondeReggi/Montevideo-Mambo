import Link from "next/link";

/** Marca gráfica: pareja bailando dentro del anillo (estilo del logo MAMBO). */
export function LogoMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      {/* Anillo estilo spray */}
      <circle
        cx="32"
        cy="32"
        r="27"
        fill="none"
        stroke="var(--lime)"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeDasharray="150 18"
        transform="rotate(-20 32 32)"
      />
      {/* Bailarín (silueta estilizada) */}
      <g fill="var(--lime)">
        <circle cx="27" cy="20" r="3.4" />
        <path d="M27 24c-1.6 0-2.9 1.2-3.1 2.8l-1.2 8.4 3 .5 1-6 .4 5.7-3.6 8.7 3 1.3 3.4-8.3 2.2 3.1-2.1 6.6 2.9.9 2.5-8.1c.3-1.1-.2-2.2-1.2-2.8l-4-2.3.9-5.7c.2-1.7-1.1-3.2-2.8-3.4a3 3 0 0 0-.5 0z" />
        {/* Compañera (giro) */}
        <circle cx="41" cy="24" r="3" />
        <path d="M41 27.5c1.5.2 2.6 1.5 2.5 3l-.5 6.5 4.2 6.4-2.6 1.7-4-6-1.4-4.6-1.6 4.8 1.4 7-2.9.6-1.7-8.2c-.1-.6 0-1.2.3-1.7l3.4-6.3c.5-1 1.5-1.6 2.6-1.5z" />
      </g>
    </svg>
  );
}

/** Logo completo con wordmark, para cabeceras. `large` lo agranda en escritorio. */
export function Logo({
  href = "/",
  compact = false,
  large = false,
}: {
  href?: string | null;
  compact?: boolean;
  large?: boolean;
}) {
  const inner = (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark
        className={`${large ? "h-8 w-8 lg:h-10 lg:w-10" : "h-8 w-8"} shrink-0 drop-shadow-[0_0_12px_rgba(196,248,43,0.5)]`}
      />
      {!compact && (
        <span className="leading-none">
          <span
            className={`block font-display tracking-[0.28em] text-muted-soft ${large ? "text-[11px] lg:text-xs" : "text-[11px]"}`}
          >
            MONTEVIDEO
          </span>
          <span
            className={`block font-display leading-none tracking-[0.14em] text-lime text-glow ${large ? "text-lg lg:text-2xl" : "text-lg"}`}
          >
            MAMBO
          </span>
        </span>
      )}
    </span>
  );
  if (href === null) return inner;
  return (
    <Link href={href} className="transition hover:opacity-90">
      {inner}
    </Link>
  );
}
