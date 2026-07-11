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
    int PendingAttendances,
    decimal DebtMoney);

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
        var many = await GetManyAsync(new[] { studentId }, ct);
        return many.GetValueOrDefault(studentId);
    }

    /// <summary>
    /// PERF-02: resúmenes de VARIOS alumnos en pocas queries (evita el N+1 del listado de
    /// asistencias). Los datos se agregan por consultas agrupadas y las fotos (signed URLs,
    /// ya cacheadas en PERF-05) se resuelven en paralelo. Devuelve un mapa por studentId.
    /// </summary>
    public async Task<Dictionary<Guid, StudentSummary>> GetManyAsync(
        IReadOnlyCollection<Guid> studentIds, CancellationToken ct = default)
    {
        var ids = studentIds.Distinct().ToList();
        if (ids.Count == 0) return new Dictionary<Guid, StudentSummary>();

        var today = clock.LocalToday();

        var students = await db.Students
            .Where(s => ids.Contains(s.Id))
            .Select(s => new { s.Id, s.User.FullName, s.PhotoPath })
            .ToListAsync(ct);

        var passes = await db.Passes
            .Where(p => ids.Contains(p.StudentId))
            .Select(p => new { p.StudentId, p.Kind, p.Status, p.Balance, p.ValidFrom, p.ValidTo, p.IsPaid, Price = p.PassType.Price })
            .ToListAsync(ct);
        var passesByStudent = passes.ToLookup(p => p.StudentId);

        // Asistencias confirmadas no cubiertas (deuda implícita D12) y pendientes, agrupadas.
        var uncovered = (await db.Attendances
            .Where(a => ids.Contains(a.StudentId) && a.Status == AttendanceStatus.Confirmed
                        && a.PassId == null && !a.CoveredByUnlimited)
            .GroupBy(a => a.StudentId)
            .Select(g => new { StudentId = g.Key, Count = g.Count() })
            .ToListAsync(ct))
            .ToDictionary(x => x.StudentId, x => x.Count);

        var pending = (await db.Attendances
            .Where(a => ids.Contains(a.StudentId) && a.Status == AttendanceStatus.Pending)
            .GroupBy(a => a.StudentId)
            .Select(g => new { StudentId = g.Key, Count = g.Count() })
            .ToListAsync(ct))
            .ToDictionary(x => x.StudentId, x => x.Count);

        // Fotos en paralelo (no tocan la BD; la signed URL viene cacheada por PERF-05).
        var photoTasks = students.ToDictionary(
            s => s.Id,
            s => photos.GetReadSignedUrlAsync(s.PhotoPath, ct: ct));
        await Task.WhenAll(photoTasks.Values);

        var result = new Dictionary<Guid, StudentSummary>(students.Count);
        foreach (var s in students)
        {
            var ps = passesByStudent[s.Id];
            var debtMoney = ps.Where(p => !p.IsPaid && p.Status != PassStatus.Cancelled).Sum(p => p.Price);
            var classesRemaining = ps
                .Where(p => p.Kind == PassKind.ClassPack && p.Status == PassStatus.Active
                            && p.ValidTo >= today && p.Balance > 0)
                .Sum(p => p.Balance);
            var hasUnlimited = ps.Any(p => p.Kind == PassKind.UnlimitedMonth
                && p.Status == PassStatus.Active && today >= p.ValidFrom && today <= p.ValidTo);
            var negativeBalances = ps.Where(p => p.Balance < 0).Sum(p => -p.Balance);

            result[s.Id] = new StudentSummary(
                s.Id, s.FullName, await photoTasks[s.Id],
                classesRemaining, hasUnlimited,
                negativeBalances + uncovered.GetValueOrDefault(s.Id),
                pending.GetValueOrDefault(s.Id), debtMoney);
        }
        return result;
    }
}
