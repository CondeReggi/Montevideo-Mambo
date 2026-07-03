"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Logo } from "./Logo";
import { Avatar } from "./index";
import { IconLogout, IconQr, IconUsers, IconCalendar, IconCash, IconTicket, IconSpark, IconGear } from "./Icons";
import { getSession, clearSession, Session } from "@/lib/auth";
import InstallBanner from "@/components/InstallBanner";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  roles: string[]; // roles que ven el item
}

const NAV: NavItem[] = [
  { href: "/checkin", label: "Check-in", icon: <IconQr />, roles: ["admin", "teacher"] },
  { href: "/teacher", label: "Clases de hoy", icon: <IconCalendar />, roles: ["admin", "teacher"] },
  { href: "/admin", label: "Panel", icon: <IconSpark />, roles: ["admin"] },
  { href: "/admin/students", label: "Alumnos", icon: <IconUsers />, roles: ["admin"] },
  { href: "/admin/teachers", label: "Profesores", icon: <IconUsers />, roles: ["admin"] },
  { href: "/admin/classes", label: "Clases", icon: <IconCalendar />, roles: ["admin"] },
  { href: "/admin/passes", label: "Cuponeras", icon: <IconTicket />, roles: ["admin"] },
  { href: "/admin/payments", label: "Pagos", icon: <IconCash />, roles: ["admin"] },
  { href: "/me", label: "Mi panel", icon: <IconSpark />, roles: ["student"] },
];

export function TopBar() {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null>(null);
  const desktopActiveRef = useRef<HTMLAnchorElement>(null);
  const mobileActiveRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => setSession(getSession()), [pathname]);

  // El item seleccionado siempre visible: se centra en su barra (incluye al refrescar).
  useEffect(() => {
    const opts: ScrollIntoViewOptions = { inline: "center", block: "nearest" };
    desktopActiveRef.current?.scrollIntoView(opts);
    mobileActiveRef.current?.scrollIntoView(opts);
  }, [pathname, session]);

  const logout = () => {
    clearSession();
    router.push("/login");
  };

  const items = session ? NAV.filter((n) => n.roles.some((r) => session.roles.includes(r))) : [];

  return (
    <header className="sticky top-0 z-40 border-b border-ink-500/60 bg-ink-900/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
        <Logo />

        <nav className="scrollbar-thin ml-4 hidden flex-1 items-center gap-1 overflow-x-auto md:flex">
          {items.map((n) => {
            const active = pathname === n.href || (n.href !== "/admin" && pathname.startsWith(n.href));
            return (
              <Link
                key={n.href}
                href={n.href}
                ref={active ? desktopActiveRef : undefined}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  active
                    ? "bg-lime/15 text-lime"
                    : "text-muted-soft hover:bg-ink-700 hover:text-foreground"
                }`}
              >
                <span className="text-base">{n.icon}</span>
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {session ? (
            <>
              <div className="hidden items-center gap-2.5 sm:flex">
                <Avatar name={session.fullName} size="sm" />
                <div className="leading-tight">
                  <p className="text-sm font-semibold">{session.fullName}</p>
                  <p className="text-[11px] uppercase tracking-wide text-muted">
                    {session.roles.join(" · ")}
                  </p>
                </div>
              </div>
              <Link
                href="/settings"
                title="Configuración"
                className="grid h-9 w-9 place-items-center rounded-lg border border-ink-500 text-muted transition hover:border-lime/40 hover:text-lime"
              >
                <IconGear />
              </Link>
              <button
                onClick={logout}
                title="Cerrar sesión"
                className="grid h-9 w-9 place-items-center rounded-lg border border-ink-500 text-muted transition hover:border-red-500/40 hover:text-red-300"
              >
                <IconLogout />
              </button>
            </>
          ) : (
            <Link href="/login" className="btn-primary btn-sm">
              Ingresar
            </Link>
          )}
        </div>
      </div>

      {/* Nav móvil */}
      {items.length > 0 && (
        <nav className="scrollbar-thin flex items-center gap-1 overflow-x-auto border-t border-ink-500/40 px-3 py-2 md:hidden">
          {items.map((n) => {
            const active = pathname === n.href || (n.href !== "/admin" && pathname.startsWith(n.href));
            return (
              <Link
                key={n.href}
                href={n.href}
                ref={active ? mobileActiveRef : undefined}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  active ? "bg-lime/15 text-lime" : "text-muted-soft"
                }`}
              >
                <span className="text-sm">{n.icon}</span>
                {n.label}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}

/** Envoltorio de página autenticada: TopBar + contenedor centrado. */
export function Shell({
  children,
  max = "max-w-5xl",
}: {
  children: React.ReactNode;
  max?: string;
}) {
  return (
    <div className="min-h-screen">
      <TopBar />
      <main className={`mx-auto w-full ${max} overflow-x-clip px-4 py-6 sm:py-8`}>
        <InstallBanner />
        {children}
      </main>
    </div>
  );
}

/** Encabezado de página con eyebrow + título + acciones. */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 animate-fade-up">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
        <h1 className="font-display text-3xl tracking-wide break-words sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-xl text-sm text-muted-soft">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
