using Mambo.Application.Abstractions;
using Microsoft.EntityFrameworkCore;

namespace Mambo.Application.UseCases;

public record PassDto(Guid Id, string Kind, int Balance, int? InitialCount,
    DateOnly ValidFrom, DateOnly ValidTo, string Status, bool IsPaid);
public record AttendanceHistoryDto(Guid Id, DateOnly Date, string ClassName, string Status, string Source, bool CoveredByUnlimited);
public record PaymentDto(Guid Id, decimal Amount, string Method, string Status, DateOnly? PaidAt, string? Concept);
public record StudentPanel(StudentSummary Summary, IReadOnlyList<PassDto> Passes,
    IReadOnlyList<AttendanceHistoryDto> History, IReadOnlyList<PaymentDto> Payments,
    IReadOnlyList<AlertDto> Alerts);

/// <summary>Arma el panel del alumno: saldo, cuponeras, historial de asistencias, pagos y avisos.</summary>
public class StudentPanelService(IMamboDbContext db, StudentSummaryService summaries, IClock clock)
{
    public async Task<StudentPanel?> GetAsync(Guid studentId, CancellationToken ct = default)
    {
        var summary = await summaries.GetAsync(studentId, ct);
        if (summary is null) return null;

        var passes = await db.Passes
            .Where(p => p.StudentId == studentId)
            .OrderByDescending(p => p.ValidTo)
            .Select(p => new PassDto(p.Id, p.Kind.ToString(), p.Balance, p.InitialCount,
                p.ValidFrom, p.ValidTo, p.Status.ToString(), p.IsPaid))
            .ToListAsync(ct);

        var history = await db.Attendances
            .Where(a => a.StudentId == studentId)
            .OrderByDescending(a => a.CheckedInAt)
            .Select(a => new AttendanceHistoryDto(a.Id, a.Session.SessionDate, a.Session.Class.Name,
                a.Status.ToString(), a.Source.ToString(), a.CoveredByUnlimited))
            .Take(100)
            .ToListAsync(ct);

        var payments = await db.Payments
            .Where(p => p.StudentId == studentId)
            .OrderByDescending(p => p.CreatedAt)
            .Select(p => new PaymentDto(p.Id, p.Amount, p.Method, p.Status.ToString(), p.PaidAt, p.Concept))
            .ToListAsync(ct);

        // Avisos/recordatorios: cuponeras por vencer, última clase y deuda.
        var today = DateOnly.FromDateTime(clock.UtcNow);
        var alerts = passes
            .SelectMany(p => PassAlerts.ForPass(p.Id, p.Kind, p.Balance, p.ValidTo, p.Status, today))
            .ToList();
        if (summary.DebtClasses > 0)
            alerts.Insert(0, new AlertDto("critical",
                $"Tenés {summary.DebtClasses} clase(s) en deuda", null));

        return new StudentPanel(summary, passes, history, payments, alerts);
    }
}
