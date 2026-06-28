import { StudentSummary } from "@/lib/api";

/** Tarjeta de verificación visual del alumno: foto + nombre + saldo. */
export default function StudentCard({ student }: { student: StudentSummary | null }) {
  if (!student) return null;

  const initials = student.fullName
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex items-center gap-4">
      {student.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={student.photoUrl}
          alt={student.fullName}
          className="w-16 h-16 rounded-full object-cover border"
        />
      ) : (
        <div className="w-16 h-16 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-semibold text-lg">
          {initials}
        </div>
      )}
      <div className="flex-1">
        <p className="font-semibold text-lg leading-tight">{student.fullName}</p>
        <div className="text-sm mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
          {student.hasActiveUnlimited ? (
            <span className="text-emerald-700 font-medium">Pase libre vigente</span>
          ) : (
            <span className={student.classesRemaining > 0 ? "text-slate-700" : "text-amber-700"}>
              {student.classesRemaining} clase(s) restante(s)
            </span>
          )}
          {student.debtClasses > 0 && (
            <span className="text-red-700 font-medium">Debe {student.debtClasses}</span>
          )}
        </div>
      </div>
    </div>
  );
}
