"use client";

import Link from "next/link";
import { useAuth } from "@/lib/useAuth";

export default function AdminHome() {
  const { ready, session } = useAuth("admin");
  if (!ready) return null;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 p-6">
      <div className="max-w-2xl mx-auto">
        <a href="/" className="text-sm text-slate-500">&larr; Inicio</a>
        <h1 className="text-2xl font-bold mt-2 mb-1">Administración</h1>
        <p className="text-sm text-slate-500 mb-6">Sesión: {session?.fullName}</p>

        <div className="grid gap-3">
          <Link href="/admin/students" className="bg-white rounded-xl shadow p-4 font-medium hover:shadow-md">
            Alumnos
          </Link>
          <Link href="/admin/classes" className="bg-white rounded-xl shadow p-4 font-medium hover:shadow-md">
            Clases
          </Link>
          <Link href="/checkin" className="bg-white rounded-xl shadow p-4 font-medium hover:shadow-md">
            Check-in (recepción)
          </Link>
          <Link href="/teacher" className="bg-white rounded-xl shadow p-4 font-medium hover:shadow-md">
            Confirmar asistencias (panel del profesor)
          </Link>
        </div>
      </div>
    </main>
  );
}
