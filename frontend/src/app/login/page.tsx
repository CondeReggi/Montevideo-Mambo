"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { login, seedDemo, ApiError } from "@/lib/api";
import { setSession } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await login(email, password);
      setSession({ ...res });
      // Redirección por rol.
      if (res.roles.includes("admin")) router.push("/admin");
      else if (res.roles.includes("teacher")) router.push("/teacher");
      else router.push("/me");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo iniciar sesión.");
    } finally {
      setBusy(false);
    }
  };

  const seed = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await seedDemo();
      setInfo(r.message);
    } catch {
      setError("No se pudo cargar datos demo (¿backend corriendo en modo Development?).");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-white rounded-xl shadow p-6">
        <h1 className="text-2xl font-bold mb-1">Ingresar</h1>
        <p className="text-sm text-slate-500 mb-5">Academia de Baile — Montevideo MAMBO</p>

        <label className="text-sm text-slate-600">Email</label>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 mb-3 mt-1"
          placeholder="admin@mambo.local"
        />
        <label className="text-sm text-slate-600">Contraseña</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          className="w-full border rounded-lg px-3 py-2 mb-4 mt-1"
          placeholder="••••••••"
        />

        {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
        {info && <p className="text-emerald-700 text-sm mb-3">{info}</p>}

        <button
          onClick={submit}
          disabled={busy || !email || !password}
          className="w-full rounded-lg bg-slate-900 text-white py-2 font-medium disabled:opacity-50"
        >
          Ingresar
        </button>

        <button
          onClick={seed}
          disabled={busy}
          className="w-full rounded-lg border mt-2 py-2 text-sm text-slate-600 disabled:opacity-50"
        >
          Cargar datos demo (desarrollo)
        </button>
      </div>
    </main>
  );
}
