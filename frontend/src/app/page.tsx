"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSession, Session } from "@/lib/auth";
import { LogoMark } from "@/components/ui/Logo";
import { Button } from "@/components/ui";
import {
  IconQr,
  IconCalendar,
  IconSpark,
  IconPin,
  IconPhone,
  IconChevron,
} from "@/components/ui/Icons";

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => setSession(getSession()), []);

  const isAdmin = session?.roles.includes("admin");
  const isTeacher = session?.roles.includes("teacher");
  const isStudent = session?.roles.includes("student");

  return (
    <main className="relative min-h-screen overflow-hidden bg-ink bg-hero-grad">
      {/* Hero */}
      <section className="relative">
        <div className="mx-auto max-w-6xl px-5 pb-16 pt-14 sm:pt-20">
          <div className="flex flex-col items-center text-center animate-fade-up">
            <LogoMark className="h-20 w-20 drop-shadow-[0_0_30px_rgba(196,248,43,0.6)] sm:h-24 sm:w-24" />
            <p className="mt-6 font-display text-sm tracking-[0.4em] text-muted-soft">
              MONTEVIDEO
            </p>
            <h1 className="font-display text-6xl leading-[0.9] tracking-tight text-lime text-glow sm:text-8xl">
              MAMBO
            </h1>
            <div className="mt-4 rounded-full bg-lime-grad px-5 py-1.5">
              <span className="font-display text-sm tracking-[0.25em] text-ink-900">
                BAILÁ · CONECTÁ · DISFRUTÁ
              </span>
            </div>
            <p className="mt-6 max-w-lg text-balance text-muted-soft">
              Plataforma de gestión de la academia: clases, asistencias por QR, cuponeras,
              pagos y control de deudas. Todo en un solo lugar.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              {!session ? (
                <>
                  <Link href="/login">
                    <Button icon={<IconSpark />}>Ingresar al sistema</Button>
                  </Link>
                  <Link href="/horarios">
                    <Button variant="ghost" icon={<IconCalendar />}>
                      Ver horarios 2026
                    </Button>
                  </Link>
                </>
              ) : (
                <>
                  <span className="text-sm text-muted-soft">
                    Hola, <b className="text-foreground">{session.fullName}</b>
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Accesos rápidos según rol */}
      {session && (
        <section className="mx-auto max-w-4xl px-5 pb-16">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {(isTeacher || isAdmin) && (
              <QuickCard href="/checkin" icon={<IconQr />} title="Check-in de recepción" desc="Escaneá el QR del alumno y verificá su identidad y saldo." />
            )}
            {(isTeacher || isAdmin) && (
              <QuickCard href="/teacher" icon={<IconCalendar />} title="Clases de hoy" desc="Confirmá o corregí las asistencias de cada sesión." />
            )}
            {isAdmin && (
              <QuickCard href="/admin" icon={<IconSpark />} title="Panel de administración" desc="Alumnos, clases, cuponeras, pagos y morosos." />
            )}
            {isStudent && (
              <QuickCard href="/me" icon={<IconSpark />} title="Mi panel" desc="Tus cuponeras, historial de clases, pagos y saldo." />
            )}
            <QuickCard href="/horarios" icon={<IconCalendar />} title="Horarios 2026" desc="Grilla completa de clases de la semana." />
          </div>
        </section>
      )}

      {/* Pie con datos de la academia */}
      <footer className="border-t border-ink-500/50 bg-ink-900/60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-2 px-5 py-6 text-sm text-muted-soft">
          <span className="inline-flex items-center gap-2">
            <IconPin /> Pablo de María 1474 esq. Brandzen
          </span>
          <span className="inline-flex items-center gap-2">
            <IconPhone /> 092 136 401
          </span>
        </div>
      </footer>
    </main>
  );
}

function QuickCard({
  href,
  icon,
  title,
  desc,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="card card-hover group flex items-center gap-4 p-5 animate-fade-up"
    >
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-lime/15 text-xl text-lime">
        {icon}
      </span>
      <div className="flex-1">
        <p className="font-semibold">{title}</p>
        <p className="mt-0.5 text-sm text-muted">{desc}</p>
      </div>
      <span className="text-muted-dim transition group-hover:translate-x-1 group-hover:text-lime">
        <IconChevron />
      </span>
    </Link>
  );
}
