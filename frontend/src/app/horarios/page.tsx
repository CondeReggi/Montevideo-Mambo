import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { IconArrowLeft } from "@/components/ui/Icons";
import HorariosGrid from "./HorariosGrid";

export const metadata = {
  title: "Horarios 2026 — Montevideo MAMBO",
  description: "Grilla completa de clases de salsa, bachata y ritmos. Bailá, conectá, disfrutá.",
};

export default function HorariosPage() {
  return (
    <main className="min-h-screen bg-hero-grad">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Logo />
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted transition hover:text-foreground"
        >
          <IconArrowLeft /> Inicio
        </Link>
      </header>

      <section className="mx-auto max-w-6xl px-5 pb-16">
        <div className="mb-8 text-center animate-fade-up">
          <p className="eyebrow">Academia de baile</p>
          <h1 className="font-display text-5xl tracking-tight text-lime text-glow sm:text-7xl">
            Horarios 2026
          </h1>
          <p className="mt-2 text-muted-soft">Salsa · Bachata · Ritmos · Cubafusión</p>
        </div>

        {/* Grilla dinámica (lee la BD; si no hay backend, usa la grilla de marca). */}
        <HorariosGrid />

        <div className="mt-10 text-center">
          <div className="inline-block rounded-full bg-lime-grad px-6 py-2">
            <span className="font-display text-sm tracking-[0.25em] text-ink-900">
              BAILÁ · CONECTÁ · DISFRUTÁ
            </span>
          </div>
        </div>
      </section>
    </main>
  );
}
