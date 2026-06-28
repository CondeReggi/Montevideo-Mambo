"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, clearSession, Session } from "@/lib/auth";

export default function Home() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => setSession(getSession()), []);

  const logout = () => {
    clearSession();
    router.push("/login");
  };

  const isAdmin = session?.roles.includes("admin");
  const isTeacher = session?.roles.includes("teacher");
  const isStudent = session?.roles.includes("student");

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        <h1 className="text-3xl font-bold">Academia de Baile</h1>
        <p className="text-slate-500 mt-2 mb-8">Montevideo MAMBO — clases, asistencias y cuponeras.</p>

        {!session ? (
          <Link href="/login" className="rounded-xl bg-slate-900 text-white py-3 px-6 font-medium inline-block">
            Ingresar
          </Link>
        ) : (
          <>
            <p className="text-sm text-slate-600 mb-4">
              Hola, <b>{session.fullName}</b> ({session.roles.join(", ")})
            </p>
            <div className="grid gap-3">
              {(isTeacher || isAdmin) && <NavLink href="/checkin" label="Check-in (recepción)" />}
              {(isTeacher || isAdmin) && <NavLink href="/teacher" label="Panel del profesor" />}
              {isStudent && <NavLink href="/me" label="Mi panel" />}
              {isAdmin && <NavLink href="/admin" label="Administración" />}
              <button onClick={logout} className="rounded-xl border py-3 text-slate-500 hover:bg-slate-100">
                Cerrar sesión
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="rounded-xl bg-white border py-3 font-medium text-slate-800 hover:bg-slate-100">
      {label}
    </Link>
  );
}
