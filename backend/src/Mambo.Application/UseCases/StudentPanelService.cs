using Mambo.Application.Abstractions;
using Microsoft.EntityFrameworkCore;

namespace Mambo.Application.UseCases;

public record PassDto(Guid Id, string Kind, int Balance, int? InitialCount,
    DateOnly ValidFrom, DateOnly ValidTo, string Status, bool IsPaid, decimal Price);
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

        // Nota: los enum se convierten a texto EN MEMORIA (no en el Select traducido a SQL),
        // porque en Postgres enum.ToString() en SQL devuelve la etiqueta snake_case del enum
        // (class_pack) en vez del nombre C# (ClassPack) y rompe el front y las reglas de avisos.
        var passes = (await db.Passes
            .Where(p => p.StudentId == studentId)
            .OrderByDescending(p => p.ValidTo)
            .Select(p => new { p.Id, p.Kind, p.Balance, p.InitialCount, p.ValidFrom, p.ValidTo, p.Status, p.IsPaid, Price = p.PassType.Price })
            .ToListAsync(ct))
            .Select(p => new PassDto(p.Id, p.Kind.ToString(), p.Balance, p.InitialCount,
                p.ValidFrom, p.ValidTo, p.Status.ToString(), p.IsPaid, p.Price))
            .ToList();

        var history = (await db.Attendances
            .Where(a => a.StudentId == studentId)
            .OrderByDescending(a => a.CheckedInAt)
            .Select(a => new { a.Id, Date = a.Session.SessionDate, ClassName = a.Session.Class.Name, a.Status, a.Source, a.CoveredByUnlimited })
            .Take(100)
            .ToListAsync(ct))
            .Select(a => new AttendanceHistoryDto(a.Id, a.Date, a.ClassName,
                a.Status.ToString(), a.Source.ToString(), a.CoveredByUnlimited))
            .ToList();

        var payments = (await db.Payments
            .Where(p => p.StudentId == studentId)
            .OrderByDescending(p => p.CreatedAt)
            .Select(p => new { p.Id, p.Amount, p.Method, p.Status, p.PaidAt, p.Concept })
            .ToListAsync(ct))
            .Select(p => new PaymentDto(p.Id, p.Amount, p.Method, p.Status.ToString(), p.PaidAt, p.Concept))
            .ToList();

        // Avisos/recordatorios: cuponeras por vencer, última clase y deuda.
        var today = clock.LocalToday();
        var alerts = passes
            .SelectMany(p => PassAlerts.ForPass(p.Id, p.Kind, p.Balance, p.ValidTo, p.Status, today))
            .ToList();
        if (summary.DebtClasses > 0)
            alerts.Insert(0, new AlertDto("critical",
                $"Tenés {summary.DebtClasses} clase(s) en deuda", null));
        // Cuponeras entregadas sin pagar → deuda de dinero del alumno.
        foreach (var p in passes.Where(p => !p.IsPaid && p.Status == "Active"))
            alerts.Add(new AlertDto("warn", $"Cuponera impaga: ${p.Price:0}", p.Id));

        return new StudentPanel(summary, passes, history, payments, alerts);
    }
}
