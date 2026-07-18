"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getPublicSchedule } from "@/lib/api";
import { WD } from "@/lib/horarios";
import { IconPin, IconPhone, IconClock, IconChevron } from "@/components/ui/Icons";
import { SocialLinks } from "@/components/SiteFooter";
import { SITE } from "@/lib/site";

// Grilla fija de marca (fallback si el backend no está disponible).
const FALLBACK_TIMES = ["18:30", "19:30", "20:30", "21:30"];
const FALLBACK_DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
const FALLBACK_GRID: Record<string, Record<string, string>> = {
  Lunes: { "18:30": "Ritmos para niñ@s", "19:30": "Curso Salsa Principiantes", "20:30": "Salsa Princ.-Avanzados", "21:30": "Cubafusión" },
  Martes: { "18:30": "Estilo Femenino Salsa", "19:30": "Bachata Princ.-Avanzados", "20:30": "Salsa Intermedio", "21:30": "Ensayos Coreográficos" },
  "Miércoles": { "18:30": "Ritmos para niñ@s", "19:30": "Curso Salsa Principiantes", "20:30": "Salsa Princ.-Avanzados", "21:30": "Cubafusión" },
  Jueves: { "18:30": "Bachata Principiantes", "19:30": "Bachata Princ.-Avanzados", "20:30": "Salsa Intermedio", "21:30": "Taller Mensual" },
  Viernes: { "18:30": "Estilo Femenino Bachata", "19:30": "Rueda de Casino", "20:30": "Mambo Shines / Parejas", "21:30": "Ensayos Coreográficos" },
};
const FALLBACK_SATURDAY = [
  { time: "14:00", name: "Bachata Principiantes" },
  { time: "15:00", name: "Salsa Principiantes" },
  { time: "16:00", name: "Salsa Princ.-Avanzados" },
];
const COURSE_DATES = ["09/03", "11/05", "06/07", "07/09", "02/11"];

interface Grid {
  times: string[];
  days: string[];
  grid: Record<string, Record<string, string>>;
  saturday: { time: string; name: string }[];
}

export default function HorariosGrid() {
  const [g, setG] = useState<Grid>({
    times: FALLBACK_TIMES, days: FALLBACK_DAYS, grid: FALLBACK_GRID, saturday: FALLBACK_SATURDAY,
  });

  useEffect(() => {
    getPublicSchedule()
      .then((items) => {
        if (!items || items.length === 0) return; // deja el fallback
        const week = items.filter((i) => i.weekday >= 1 && i.weekday <= 5);
        const sat = items.filter((i) => i.weekday === 6);
        if (week.length === 0 && sat.length === 0) return;

        const hm = (t: string) => t.slice(0, 5);
        const times = Array.from(new Set(week.map((i) => hm(i.startTime)))).sort();
        const days = Array.from(new Set(week.map((i) => WD[i.weekday])))
          .sort((a, b) => WD.indexOf(a) - WD.indexOf(b));
        const grid: Record<string, Record<string, string>> = {};
        for (const d of days) grid[d] = {};
        for (const i of week) grid[WD[i.weekday]][hm(i.startTime)] = i.name;
        const saturday = sat
          .map((i) => ({ time: hm(i.startTime), name: i.name }))
          .sort((a, b) => a.time.localeCompare(b.time));

        setG({
          times: times.length ? times : FALLBACK_TIMES,
          days: days.length ? days : FALLBACK_DAYS,
          grid,
          saturday: saturday.length ? saturday : FALLBACK_SATURDAY,
        });
      })
      .catch(() => {/* mantiene el fallback de marca */});
  }, []);

  // gridTemplateColumns por style inline: Tailwind no genera clases construidas con
  // interpolación, por eso la grilla dinámica no puede usar grid-cols-[...] armado en JS.
  const colStyle = { gridTemplateColumns: `80px repeat(${g.days.length}, 1fr)` };

  return (
    <>
      {/* Grilla semanal (tocá un día para ver su detalle) */}
      <div className="scrollbar-thin overflow-x-auto animate-fade-up">
        <div className="min-w-[720px]">
          <div className="grid gap-2" style={colStyle}>
            <div />
            {g.days.map((d) => (
              <Link
                key={d}
                href={`/horarios/${WD.indexOf(d)}`}
                className="group flex items-center justify-center gap-1 rounded-xl bg-lime-grad py-2 text-center font-display text-sm tracking-wide text-ink-900 transition hover:brightness-110"
              >
                {d}
                <IconChevron className="text-ink-900/70 transition group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
          {g.times.map((t) => (
            <div key={t} className="mt-2 grid gap-2" style={colStyle}>
              <div className="grid place-items-center rounded-xl border border-ink-500 bg-ink-800 font-display text-sm text-lime">
                {t}
              </div>
              {g.days.map((d) => (
                <Link
                  key={d + t}
                  href={`/horarios/${WD.indexOf(d)}`}
                  className="flex items-center justify-center rounded-xl border border-ink-500/70 bg-ink-800/80 px-2 py-3 text-center text-xs font-medium text-foreground transition hover:border-lime/40 hover:bg-ink-700/60"
                >
                  {g.grid[d]?.[t] ?? ""}
                </Link>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Sábado + cursos */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-[1fr_2fr]">
        <div className="card p-5 animate-fade-up">
          <Link href="/horarios/6" className="group mb-3 inline-flex items-center gap-1.5 font-display text-xl tracking-wide text-lime transition hover:brightness-110">
            Sábado <IconChevron className="transition group-hover:translate-x-0.5" />
          </Link>
          <div className="space-y-2">
            {g.saturday.map((s) => (
              <Link key={s.time + s.name} href="/horarios/6" className="flex items-center gap-3 rounded-xl border border-ink-500/60 bg-ink-900/40 p-3 transition hover:border-lime/40">
                <span className="grid h-10 w-14 shrink-0 place-items-center rounded-lg bg-lime/15 font-display text-sm text-lime">
                  {s.time}
                </span>
                <span className="text-sm font-medium">{s.name}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="card flex flex-col justify-between p-5 animate-fade-up">
          <div>
            <h2 className="mb-2 flex items-center gap-2 font-display text-xl tracking-wide text-lime">
              <IconClock /> Cursos bimestrales de Salsa
            </h2>
            <div className="flex flex-wrap gap-2">
              {COURSE_DATES.map((d) => (
                <span key={d} className="chip-lime font-display tracking-wide">
                  {d}
                </span>
              ))}
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-ink-500/50 pt-4 text-sm text-muted-soft">
            <a href={SITE.mapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 transition hover:text-lime">
              <IconPin /> {SITE.address}
            </a>
            <a href={SITE.phoneHref} className="inline-flex items-center gap-2 transition hover:text-lime">
              <IconPhone /> {SITE.phoneDisplay}
            </a>
            <SocialLinks className="ml-auto" />
          </div>
        </div>
      </div>
    </>
  );
}
