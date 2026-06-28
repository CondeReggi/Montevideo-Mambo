using Mambo.Application.Abstractions;
using Mambo.Domain;
using Mambo.Domain.Entities;
using Mambo.Domain.Rules;
using Microsoft.EntityFrameworkCore;

namespace Mambo.Application.UseCases;

public record ConfirmResult(Guid AttendanceId, AttendanceStatus Status, string Coverage, bool GeneratedDebt);

/// <summary>
/// Confirma asistencias y aplica el consumo de cuponera (regla R4).
/// Reglas clave: nunca se impide confirmar por falta de saldo (R5); las correcciones
/// se hacen por compensación, nunca editando el ledger (R6).
/// </summary>
public class AttendanceConfirmationService(IMamboDbContext db, IClock clock, IAuditService audit)
{
    /// <summary>Confirma una asistencia individual.</summary>
    public async Task<ConfirmResult> ConfirmAsync(Guid attendanceId, Guid actorUserId, CancellationToken ct = default)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var result = await ConfirmCoreAsync(attendanceId, actorUserId, ct);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return result;
    }

    /// <summary>Confirma toda una lista (toda la clase) en una sola transacción.</summary>
    public async Task<IReadOnlyList<ConfirmResult>> ConfirmManyAsync(IEnumerable<Guid> attendanceIds, Guid actorUserId, CancellationToken ct = default)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var results = new List<ConfirmResult>();
        foreach (var id in attendanceIds.Distinct())
            results.Add(await ConfirmCoreAsync(id, actorUserId, ct));
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return results;
    }

    private async Task<ConfirmResult> ConfirmCoreAsync(Guid attendanceId, Guid actorUserId, CancellationToken ct)
    {
        var att = await db.Attendances.Include(a => a.Session)
            .FirstOrDefaultAsync(a => a.Id == attendanceId, ct)
            ?? throw new InvalidOperationException("Asistencia no encontrada.");

        if (att.Status == AttendanceStatus.Confirmed)
            return new ConfirmResult(att.Id, att.Status, att.CoveredByUnlimited ? "unlimited" : "pass", false);
        if (att.Status is AttendanceStatus.Rejected)
            throw new InvalidOperationException("La asistencia está rechazada; reabrir requiere acción de admin.");

        var now = clock.UtcNow;
        var onDate = att.Session.SessionDate;

        // Cuponeras candidatas del alumno (vigentes).
        var passes = await db.Passes
            .Where(p => p.StudentId == att.StudentId && p.Status == PassStatus.Active)
            .ToListAsync(ct);

        var decision = ConsumptionPolicy.Decide(passes, onDate);

        att.Status = AttendanceStatus.Confirmed;
        att.ConfirmedAt = now;
        att.ConfirmedBy = actorUserId;
        att.UpdatedAt = now;

        string coverage;
        bool debt = false;

        switch (decision.Kind)
        {
            case CoverageKind.Unlimited:
                att.CoveredByUnlimited = true;
                att.PassId = null;
                coverage = "unlimited";
                break;

            case CoverageKind.Pass:
                ConsumeFromPass(decision.Pass!, att, actorUserId, now);
                coverage = "pass";
                break;

            default: // Debt
                if (decision.Pass is not null)
                {
                    ConsumeFromPass(decision.Pass, att, actorUserId, now); // deja saldo negativo
                    debt = true;
                    coverage = "debt_on_pass";
                }
                else
                {
                    // Sin ninguna cuponera: se confirma igual (R5). Queda como "no cubierta" = deuda implícita.
                    att.PassId = null;
                    att.CoveredByUnlimited = false;
                    debt = true;
                    coverage = "debt_uncovered";
                }
                break;
        }

        audit.Record(actorUserId, "confirm_attendance", "attendance", att.Id,
            new { coverage, debt });

        return new ConfirmResult(att.Id, att.Status, coverage, debt);
    }

    private void ConsumeFromPass(Pass pass, Attendance att, Guid actorUserId, DateTime now)
    {
        att.PassId = pass.Id;
        att.CoveredByUnlimited = false;

        db.LedgerEntries.Add(new PassLedgerEntry
        {
            Id = Guid.NewGuid(),
            PassId = pass.Id,
            Delta = -1,
            Reason = LedgerReason.Consume,
            AttendanceId = att.Id,
            CreatedBy = actorUserId,
            CreatedAt = now
        });

        // Mantener el caché en memoria (el trigger de BD lo recalcula al mismo valor).
        pass.Balance -= 1;
        if (pass.Balance <= 0 && pass.Kind != PassKind.UnlimitedMonth && pass.Balance == 0)
            pass.Status = PassStatus.Exhausted;
    }

    /// <summary>Rechaza una asistencia pendiente (sin efecto en saldo).</summary>
    public async Task RejectAsync(Guid attendanceId, Guid actorUserId, string? reason, CancellationToken ct = default)
    {
        var att = await db.Attendances.FirstOrDefaultAsync(a => a.Id == attendanceId, ct)
            ?? throw new InvalidOperationException("Asistencia no encontrada.");
        if (att.Status == AttendanceStatus.Confirmed)
            throw new InvalidOperationException("No se puede rechazar una asistencia confirmada; usar corrección.");

        att.Status = AttendanceStatus.Rejected;
        att.CorrectionReason = reason;
        att.UpdatedAt = clock.UtcNow;
        audit.Record(actorUserId, "reject_attendance", "attendance", att.Id, new { reason });
        await db.SaveChangesAsync(ct);
    }

    /// <summary>
    /// Corrige una asistencia confirmada (motivo opcional, R6). Si hubo consumo,
    /// genera un crédito compensatorio en el ledger (no edita la fila original).
    /// </summary>
    public async Task CorrectAsync(Guid attendanceId, Guid actorUserId, string? reason, CancellationToken ct = default)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var att = await db.Attendances.FirstOrDefaultAsync(a => a.Id == attendanceId, ct)
            ?? throw new InvalidOperationException("Asistencia no encontrada.");
        var now = clock.UtcNow;

        // Revertir consumo si lo hubo.
        if (att.PassId is Guid passId && !att.CoveredByUnlimited)
        {
            db.LedgerEntries.Add(new PassLedgerEntry
            {
                Id = Guid.NewGuid(),
                PassId = passId,
                Delta = +1,
                Reason = LedgerReason.CorrectionReverse,
                AttendanceId = att.Id,
                CreatedBy = actorUserId,
                Note = reason,
                CreatedAt = now
            });
            var pass = await db.Passes.FirstAsync(p => p.Id == passId, ct);
            pass.Balance += 1;
            if (pass.Status == PassStatus.Exhausted && pass.Balance > 0)
                pass.Status = PassStatus.Active;
        }

        att.Status = AttendanceStatus.Corrected;
        att.CorrectionReason = reason;
        att.UpdatedAt = now;
        audit.Record(actorUserId, "correct_attendance", "attendance", att.Id, new { reason });

        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
    }
}
