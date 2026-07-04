using Mambo.Application.Abstractions;
using Mambo.Domain;
using Microsoft.EntityFrameworkCore;

namespace Mambo.Application.UseCases;

public record StudentRiskDto(Guid StudentId, string FullName, string Level, string Message);
public record OldPendingDto(Guid AttendanceId, Guid SessionId, Guid StudentId, string StudentName,
    string ClassName, DateTime EndAt, string Level);

/// <summary>
/// Recordatorios agregados para administración y profesores:
/// alumnos con cuponera por vencer / última clase, y asistencias pendientes de
/// clases ya finalizadas (que el profe debería confirmar).
/// </summary>
public class AlertsService(IMamboDbContext db, IClock clock)
{
    /// <summary>Alumnos con cuponera crítica/por vencer (usa las mismas reglas que el alumno).</summary>
    public async Task<List<StudentRiskDto>> ListStudentsAtRiskAsync(CancellationToken ct = default)
    {
        var today = clock.LocalToday();
        var passes = await db.Passes
            .Where(p => p.Status == PassStatus.Active)
            .Select(p => new
            {
                p.Id, p.StudentId,
                FullName = p.Student.User.FullName,
                Kind = p.Kind.ToString(),
                p.Balance, p.ValidTo, Status = p.Status.ToString(),
            })
            .ToListAsync(ct);

        var risks = passes
            .SelectMany(p => PassAlerts.ForPass(p.Id, p.Kind, p.Balance, p.ValidTo, p.Status, today)
                .Select(a => new StudentRiskDto(p.StudentId, p.FullName, a.Level, a.Message)))
            .OrderBy(r => r.Level == "critical" ? 0 : 1)
            .ThenBy(r => r.FullName)
            .ToList();
        return risks;
    }

    /// <summary>Asistencias pendientes cuya clase ya terminó (crítico si terminó hace más de 24h).</summary>
    public async Task<List<OldPendingDto>> ListOldPendingAsync(CancellationToken ct = default)
    {
        var now = clock.UtcNow;
        var rows = await db.Attendances
            .Where(a => a.Status == AttendanceStatus.Pending && a.Session.EndAt < now)
            .Select(a => new
            {
                a.Id, a.ClassSessionId, a.StudentId,
                StudentName = a.Student.User.FullName,
                ClassName = a.Session.Class.Name,
                a.Session.EndAt,
            })
            .ToListAsync(ct);

        return rows
            .OrderBy(r => r.EndAt)
            .Select(r => new OldPendingDto(r.Id, r.ClassSessionId, r.StudentId, r.StudentName,
                r.ClassName, r.EndAt, r.EndAt < now.AddHours(-24) ? "critical" : "warn"))
            .ToList();
    }
}
