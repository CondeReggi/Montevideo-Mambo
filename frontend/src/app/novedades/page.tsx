import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { IconArrowLeft } from "@/components/ui/Icons";
import ContentFeed from "@/components/ContentFeed";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata = {
  title: "Novedades — Montevideo MAMBO",
  description: "Noticias, muestras, talleres y eventos de la academia. Bailá, conectá, disfrutá.",
};

export default function NovedadesPage() {
  return (
    <main className="min-h-screen bg-hero-grad">
      <header className="mx-auto flex max-w-4xl items-center justify-between px-5 py-5">
        <Logo />
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted transition hover:text-foreground"
        >
          <IconArrowLeft /> Inicio
        </Link>
      </header>

      <section className="mx-auto max-w-4xl px-5 pb-16">
        <div className="mb-8 text-center animate-fade-up">
          <p className="eyebrow">Academia de baile</p>
          <h1 className="font-display text-5xl tracking-tight text-lime text-glow sm:text-7xl">
            Novedades
          </h1>
          <p className="mt-2 text-muted-soft">Noticias · Muestras · Talleres · Eventos</p>
        </div>

        <ContentFeed />
      </section>

      <SiteFooter />
    </main>
  );
}
