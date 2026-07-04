import { StudentSummary } from "@/lib/api";
import { Avatar, Badge } from "@/components/ui";

/** Tarjeta de verificación visual del alumno: foto + nombre + saldo. */
export default function StudentCard({
  student,
  size = "md",
}: {
  student: StudentSummary | null;
  size?: "md" | "lg";
}) {
  if (!student) return null;

  return (
    <div className="flex items-center gap-4">
      <Avatar name={student.fullName} photoUrl={student.photoUrl} size={size === "lg" ? "lg" : "md"} ring />
      <div className="min-w-0 flex-1">
        <p className={`truncate font-semibold ${size === "lg" ? "text-xl" : "text-lg"} leading-tight`}>
          {student.fullName}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {student.hasActiveUnlimited ? (
            <Badge tone="lime">Pase libre vigente</Badge>
          ) : (
            <Badge tone={student.classesRemaining > 0 ? "lime" : "muted"}>
              {student.classesRemaining} clase{student.classesRemaining === 1 ? "" : "s"}
            </Badge>
          )}
          {student.debtMoney > 0 && <Badge tone="red">Debe ${student.debtMoney}</Badge>}
          {student.debtClasses > 0 && <Badge tone="red">Debe {student.debtClasses} clase(s)</Badge>}
          {student.pendingAttendances > 0 && (
            <Badge tone="amber">{student.pendingAttendances} pendiente(s)</Badge>
          )}
        </div>
      </div>
    </div>
  );
}
