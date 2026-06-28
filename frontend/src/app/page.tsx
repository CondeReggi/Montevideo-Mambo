import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        <h1 className="text-3xl font-bold">Academia de Baile</h1>
        <p className="text-slate-500 mt-2 mb-8">Montevideo MAMBO — gestión de clases, asistencias y cuponeras.</p>

        <div className="grid gap-3">
          <Link
            href="/checkin"
            className="rounded-xl bg-slate-900 text-white py-3 font-medium shadow hover:bg-slate-800"
          >
            Check-in (recepción)
          </Link>
          <span className="rounded-xl bg-white border py-3 text-slate-400 cursor-not-allowed">
            Panel del alumno (próximamente)
          </span>
          <Link
            href="/teacher"
            className="rounded-xl bg-white border py-3 font-medium text-slate-800 hover:bg-slate-100"
          >
            Panel del profesor
          </Link>
          <span className="rounded-xl bg-white border py-3 text-slate-400 cursor-not-allowed">
            Administración (próximamente)
          </span>
        </div>
      </div>
    </main>
  );
}
