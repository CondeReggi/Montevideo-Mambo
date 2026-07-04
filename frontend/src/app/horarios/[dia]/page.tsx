"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Logo } from "@/components/ui/Logo";
import { IconArrowLeft, IconClock, IconPin, IconPhone } from "@/components/ui/Icons";
import { getPublicSchedule } from "@/lib/api";
import { WD, FALLBACK_SCHEDULE, classDescription, SchedClass } from "@/lib/horarios";

export default function DiaDetalle() {
  const { dia } = useParams<{ dia: string }>();
  const weekday = Number(dia);
  const valid = Number.isInteger(weekday) && weekday >= 0 && weekday <= 6;

  const [classes, setClasses] = useState<SchedClass[]>(
    valid ? FALLBACK_SCHEDULE.filter((c) => c.weekday === weekday) : [],
  );

  useEffect(() => {
    if (!valid) return;
    getPublicSchedule()
      .then((items) => {
        const day = (items ?? [])
          .filter((i) => i.weekday === weekday)
          .map((i) => ({
            weekday: i.weekday,
            startTime: i.startTime.slice(0, 5),
            endTime: i.endTime.slice(0, 5),
            name: i.name,
            style: i.style,
            level: i.level,
          }))
          .sort((a, b) => a.startTime.localeCompare(b.startTime));
        if (day.length > 0) setClasses(day);
      })
      .catch(() => {/* mantiene el fallback */});
  }, [weekday, valid]);

  const dayName = valid ? WD[weekday] : "Día";
  const sorted = [...classes].sort((a, b) => a.startTime.localeCompare(b.startTime));

  return (
    <main className="min-h-screen bg-hero-grad">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-5">
        <Logo />
        <Link href="/horarios" className="inline-flex items-center gap-1.5 text-sm text-muted transition hover:text-foreground">
          <IconArrowLeft /> Horarios
        </Link>
      </header>

      <section className="mx-auto max-w-3xl px-5 pb-16">
        <div className="mb-8 text-center animate-fade-up">
          <p className="eyebrow">Clases del día</p>
          <h1 className="font-display text-5xl tracking-tight text-lime text-glow sm:text-6xl">{dayName}</h1>
          <p className="mt-2 text-muted-soft">
            {sorted.length > 0 ? `${sorted.length} clase(s) este día` : "No hay clases cargadas para este día."}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {sorted.map((c) => (
            <div
              key={c.startTime + c.name}
              className="card flex flex-col gap-3 p-5 animate-fade-up sm:flex-row sm:items-start"
            >
              <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-start">
                <span className="inline-flex items-center gap-1.5 rounded-xl bg-lime/15 px-3 py-2 font-display text-lg text-lime">
                  <IconClock className="text-sm" /> {c.startTime}
                </span>
                <span className="text-xs text-muted-dim">a {c.endTime}</span>
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-xl tracking-wide">{c.name}</h2>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <span className="chip-lime">{c.style}</span>
                  <span className="chip-muted">{c.level}</span>
                </div>
                <p className="mt-2 text-sm text-muted-soft">{classDescription(c.name, c.style)}</p>
              </div>
            </div>
          ))}
        </div>

        {sorted.length === 0 && (
          <div className="rounded-2xl border border-dashed border-ink-500 bg-ink-900/40 px-6 py-12 text-center text-muted-soft">
            No hay clases programadas para {dayName}.
          </div>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-soft">
          <span className="inline-flex items-center gap-2"><IconPin /> Pablo de María 1474 esq. Brandzen</span>
          <span className="inline-flex items-center gap-2"><IconPhone /> 092 136 401</span>
        </div>

        <div className="mt-8 text-center">
          <Link href="/horarios" className="btn-ghost btn-sm">
            <IconArrowLeft /> Volver a la grilla
          </Link>
        </div>
      </section>
    </main>
  );
}
