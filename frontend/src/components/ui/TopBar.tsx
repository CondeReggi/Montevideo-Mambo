"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Logo } from "./Logo";
import { Avatar } from "./index";
import { IconLogout, IconQr, IconUsers, IconCalendar, IconCash, IconTicket, IconSpark, IconGear, IconMenu, IconX } from "./Icons";
import { getSession, Session } from "@/lib/auth";
import { endSession } from "@/lib/api";
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
  const [menuOpen, setMenuOpen] = useState(false);
  const desktopActiveRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => setSession(getSession()), [pathname]);

  // Cerrar el menú móvil al cambiar de ruta.
  useEffect(() => setMenuOpen(false), [pathname]);

  // El item seleccionado siempre visible en la barra de escritorio (incluye al refrescar).
  useEffect(() => {
    desktopActiveRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [pathname, session]);

  // Con el menú abierto: cerrar con Escape y bloquear el scroll del fondo.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  const logout = async () => {
    setMenuOpen(false);
    await endSession();
    router.push("/login");
  };

  const items = session ? NAV.filter((n) => n.roles.some((r) => session.roles.includes(r))) : [];
  const isActive = (href: string) => pathname === href || (href !== "/admin" && pathname.startsWith(href));

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-ink-500/60 bg-ink-900/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
        {/* Burger (solo móvil) */}
        {items.length > 0 && (
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menú"
            className="-ml-1 grid h-10 w-10 place-items-center rounded-lg border border-ink-500 text-lg text-foreground transition hover:border-lime/40 hover:text-lime active:scale-95 md:hidden"
          >
            <IconMenu />
          </button>
        )}

        <Logo />

        <nav className="scrollbar-thin ml-4 hidden flex-1 items-center gap-1 overflow-x-auto md:flex">
          {items.map((n) => {
            const active = isActive(n.href);
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
              {/* En móvil estas acciones viven dentro del menú lateral. */}
              <Link
                href="/settings"
                title="Configuración"
                className="hidden h-9 w-9 place-items-center rounded-lg border border-ink-500 text-muted transition hover:border-lime/40 hover:text-lime md:grid"
              >
                <IconGear />
              </Link>
              <button
                onClick={logout}
                title="Cerrar sesión"
                className="hidden h-9 w-9 place-items-center rounded-lg border border-ink-500 text-muted transition hover:border-red-500/40 hover:text-red-300 md:grid"
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

      </header>

      {/* Menú lateral (drawer) móvil — se renderiza en un PORTAL a document.body para
          escapar el containing block que crea el backdrop-filter del header; si no, el
          `fixed` se posiciona relativo al header y no cubre toda la pantalla. */}
      {menuOpen && items.length > 0 && typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[100] md:hidden" role="dialog" aria-modal="true" aria-label="Menú">
          <div
            className="absolute inset-0 animate-fade-in bg-black/60 backdrop-blur-sm"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-[84%] max-w-xs animate-slide-in-left flex-col border-r border-ink-500/60 bg-ink-900 shadow-2xl">
            {/* Encabezado del drawer */}
            <div className="flex h-16 items-center justify-between border-b border-ink-500/50 px-4">
              <Logo />
              <button
                onClick={() => setMenuOpen(false)}
                aria-label="Cerrar menú"
                className="grid h-10 w-10 place-items-center rounded-lg border border-ink-500 text-lg text-muted transition hover:text-foreground active:scale-95"
              >
                <IconX />
              </button>
            </div>

            {/* Usuario */}
            {session && (
              <div className="flex items-center gap-3 border-b border-ink-500/40 px-4 py-4">
                <Avatar name={session.fullName} size="md" />
                <div className="min-w-0 leading-tight">
                  <p className="truncate text-sm font-semibold">{session.fullName}</p>
                  <p className="text-[11px] uppercase tracking-wide text-muted">
                    {session.roles.join(" · ")}
                  </p>
                </div>
              </div>
            )}

            {/* Navegación */}
            <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-3">
              {items.map((n) => {
                const active = isActive(n.href);
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    onClick={() => setMenuOpen(false)}
                    className={`flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium transition ${
                      active
                        ? "bg-lime/15 text-lime"
                        : "text-muted-soft hover:bg-ink-700 hover:text-foreground"
                    }`}
                  >
                    <span className="text-lg">{n.icon}</span>
                    {n.label}
                  </Link>
                );
              })}
            </nav>

            {/* Acciones */}
            <div className="flex flex-col gap-1 border-t border-ink-500/50 px-3 py-3">
              <Link
                href="/settings"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium text-muted-soft transition hover:bg-ink-700 hover:text-foreground"
              >
                <span className="text-lg">
                  <IconGear />
                </span>
                Configuración
              </Link>
              <button
                onClick={logout}
                className="flex items-center gap-3 rounded-xl px-3.5 py-3 text-left text-sm font-medium text-red-300 transition hover:bg-red-500/10"
              >
                <span className="text-lg">
                  <IconLogout />
                </span>
                Cerrar sesión
              </button>
            </div>
          </div>
          </div>,
          document.body,
        )}
    </>
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
