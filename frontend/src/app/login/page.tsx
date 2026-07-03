"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { login, seedDemo, ApiError } from "@/lib/api";
import { setSession } from "@/lib/auth";
import { LogoMark } from "@/components/ui/Logo";
import { Button, Field } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { IconSpark, IconArrowLeft } from "@/components/ui/Icons";

const DEMO = [
  { label: "Admin", email: "admin@mambo.local", pass: "Admin1234!" },
  { label: "Profesor", email: "profe@mambo.local", pass: "Profe1234!" },
  { label: "Alumna", email: "ana@mambo.local", pass: "Alumno1234!" },
];

export default function LoginPage() {
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email || !password) return;
    setBusy(true);
    try {
      const res = await login(email, password);
      setSession({ ...res });
      toast.success(`¡Bienvenido, ${res.fullName.split(" ")[0]}!`);
      if (res.roles.includes("admin")) router.push("/admin");
      else if (res.roles.includes("teacher")) router.push("/teacher");
      else router.push("/me");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo iniciar sesión.");
    } finally {
      setBusy(false);
    }
  };

  const seed = async () => {
    setBusy(true);
    try {
      const r = await seedDemo();
      toast.success(r.message);
    } catch {
      toast.error("No se pudo cargar datos demo (¿backend en modo Development?).");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-hero-grad px-5 py-10">
      <Link
        href="/"
        className="absolute left-5 top-5 inline-flex items-center gap-1.5 text-sm text-muted transition hover:text-foreground"
      >
        <IconArrowLeft /> Inicio
      </Link>

      <div className="w-full max-w-sm animate-fade-up">
        <div className="mb-6 flex flex-col items-center text-center">
          <LogoMark className="h-14 w-14 drop-shadow-[0_0_24px_rgba(196,248,43,0.5)]" />
          <h1 className="mt-4 font-display text-2xl tracking-wide">Ingresá a MAMBO</h1>
          <p className="mt-1 text-sm text-muted">Gestión de la academia de baile</p>
        </div>

        <div className="card space-y-4 p-6">
          <Field label="Email" value={email} onChange={setEmail} placeholder="admin@mambo.local" type="email" />
          <div>
            <Field
              label="Contraseña"
              value={password}
              onChange={setPassword}
              placeholder="••••••••"
              type="password"
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>
          <Button onClick={submit} loading={busy} disabled={!email || !password} className="w-full" icon={<IconSpark />}>
            Ingresar
          </Button>

          <div className="border-t border-ink-500/60 pt-4">
            <p className="mb-2 text-center text-xs uppercase tracking-wide text-muted-dim">
              Acceso rápido (demo)
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {DEMO.map((d) => (
                <button
                  key={d.email}
                  onClick={() => {
                    setEmail(d.email);
                    setPassword(d.pass);
                  }}
                  className="chip-muted transition hover:bg-ink-500"
                >
                  {d.label}
                </button>
              ))}
            </div>
            <button
              onClick={seed}
              disabled={busy}
              className="mt-3 w-full text-center text-xs text-muted transition hover:text-lime disabled:opacity-50"
            >
              Cargar datos demo
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
