using Mambo.Application.Abstractions;
using Mambo.Domain;
using Microsoft.EntityFrameworkCore;

namespace Mambo.Application.UseCases;

/// <summary>Resumen del alumno para verificación visual y panel del alumno.</summary>
public record StudentSummary(
    Guid StudentId,
    string FullName,
    string? PhotoUrl,
    int ClassesRemaining,
    bool HasActiveUnlimited,
    int DebtClasses,
    int PendingAttendances);

/// <summary>
/// Construye el resumen de saldo/estado de un alumno. Se usa para:
/// - la verificación visual al escanear el QR (foto + nombre + saldo);
/// - el panel del alumno.
/// La deuda combina saldos negativos de cuponeras y asistencias confirmadas no cubiertas (D12).
/// </summary>
public class StudentSummaryService(IMamboDbContext db, IPhotoStorage photos, IClock clock)
{
    public async Task<StudentSummary?> GetAsync(Guid studentId, CancellationToken ct = default)
    {
        var student = await db.Students
            .Where(s => s.Id == studentId)
            .Select(s => new { s.Id, s.User.FullName, s.PhotoPath })
            .FirstOrDefaultAsync(ct);
        if (student is null) return null;

        var today = DateOnly.FromDateTime(clock.UtcNow);
        var passes = await db.Passes
            .Where(p => p.StudentId == studentId)
            .Select(p => new { p.Kind, p.Status, p.Balance, p.ValidFrom, p.ValidTo })
            .ToListAsync(ct);

        var classesRemaining = passes
            .Where(p => p.Kind == PassKind.ClassPack && p.Status == PassStatus.Active
                        && p.ValidTo >= today && p.Balance > 0)
            .Sum(p => p.Balance);

        var hasUnlimited = passes.Any(p => p.Kind == PassKind.UnlimitedMonth
            && p.Status == PassStatus.Active && today >= p.ValidFrom && today <= p.ValidTo);

        var negativeBalances = passes.Where(p => p.Balance < 0).Sum(p => -p.Balance);

        // Asistencias confirmadas no cubiertas (sin cuponera ni pase libre) = deuda implícita (D12).
        var uncovered = await db.Attendances.CountAsync(a =>
            a.StudentId == studentId && a.Status == AttendanceStatus.Confirmed
            && a.PassId == null && !a.CoveredByUnlimited, ct);

        var pending = await db.Attendances.CountAsync(a =>
            a.StudentId == studentId && a.Status == AttendanceStatus.Pending, ct);

        var photoUrl = await photos.GetReadSignedUrlAsync(student.PhotoPath, ct: ct);

        return new StudentSummary(student.Id, student.FullName, photoUrl,
            classesRemaining, hasUnlimited, negativeBalances + uncovered, pending);
    }
}
