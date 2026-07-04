using Mambo.Application.Abstractions;
using Mambo.Domain;
using Mambo.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Mambo.Application.UseCases;

public record PassTypeDto(Guid Id, string Name, string Kind, int? ClassCount, decimal Price, int ValidityDays);
public record AssignPassInput(Guid StudentId, Guid PassTypeId, bool RegisterPayment, string? PaymentMethod);
public record ExtendPassInput(int ExtraDays, int ExtraClasses, string? Reason);
public record RegisterPaymentInput(Guid StudentId, decimal Amount, string Method, string? Concept, Guid? PassId, bool Confirmed);
public record DebtorDto(Guid StudentId, string FullName, int DebtClasses, int PendingAttendances, int ClassesRemaining, decimal DebtMoney);
public record PendingPaymentDto(Guid Id, Guid StudentId, string FullName, decimal Amount, string Method, string? Concept, DateTime CreatedAt);

/// <summary>
/// Gestión de cuponeras y pagos (rol admin). Toda alta de crédito pasa por el ledger
/// inmutable (R7); nunca se editan filas existentes. Los pagos son manuales (sin pasarela).
/// </summary>
public class BillingService(IMamboDbContext db, IClock clock, IAuditService audit)
{
    public async Task<List<PassTypeDto>> ListPassTypesAsync(CancellationToken ct = default)
    {
        // Nota: SQLite no soporta ORDER BY sobre decimal; se ordena en memoria por precio.
        // Kind.ToString() se hace EN MEMORIA (en Postgres, dentro del SQL, devolvería la
        // etiqueta snake_case del enum en vez del nombre C#).
        var raw = await db.PassTypes.Where(t => t.IsActive)
            .Select(t => new { t.Id, t.Name, t.Kind, t.ClassCount, t.Price, t.ValidityDays })
            .ToListAsync(ct);
        return raw.OrderBy(t => t.Price)
            .Select(t => new PassTypeDto(t.Id, t.Name, t.Kind.ToString(), t.ClassCount, t.Price, t.ValidityDays))
            .ToList();
    }

    /// <summary>Asigna una cuponera del catálogo a un alumno, con crédito inicial vía ledger.</summary>
    public async Task<Guid> AssignPassAsync(AssignPassInput i, Guid actor, CancellationToken ct = default)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);

        var type = await db.PassTypes.FirstOrDefaultAsync(t => t.Id == i.PassTypeId, ct)
            ?? throw new InvalidOperationException("Tipo de cuponera no encontrado.");
        if (!await db.Students.AnyAsync(s => s.Id == i.StudentId, ct))
            throw new InvalidOperationException("Alumno no encontrado.");

        var today = clock.LocalToday();
        var now = clock.UtcNow;
        var credit = type.Kind == PassKind.UnlimitedMonth ? 0 : (type.ClassCount ?? 1);

        var pass = new Pass
        {
            Id = Guid.NewGuid(),
            StudentId = i.StudentId,
            PassTypeId = type.Id,
            Kind = type.Kind,
            InitialCount = type.Kind == PassKind.UnlimitedMonth ? null : credit,
            Balance = 0,
            ValidFrom = today,
            ValidTo = today.AddDays(type.ValidityDays),
            Status = PassStatus.Active,
            IsPaid = i.RegisterPayment,
            CreatedAt = now,
            UpdatedAt = now
        };
        db.Passes.Add(pass);
        await db.SaveChangesAsync(ct);

        Guid? paymentId = null;
        if (i.RegisterPayment)
        {
            var payment = new Payment
            {
                Id = Guid.NewGuid(),
                StudentId = i.StudentId,
                Amount = type.Price,
                Method = string.IsNullOrWhiteSpace(i.PaymentMethod) ? "efectivo" : i.PaymentMethod!,
                Status = PaymentStatus.Confirmed,
                PassId = pass.Id,
                Concept = type.Name,
                PaidAt = today,
                ConfirmedBy = actor,
                CreatedAt = now,
                UpdatedAt = now
            };
            db.Payments.Add(payment);
            paymentId = payment.Id;
            // Guardar el pago ANTES del ledger: el movimiento referencia payment_id por FK
            // y Postgres la enforcea (SQLite no). Sin esto, el insert del ledger falla (23503).
            await db.SaveChangesAsync(ct);
        }

        if (credit > 0)
        {
            db.LedgerEntries.Add(new PassLedgerEntry
            {
                Id = Guid.NewGuid(), PassId = pass.Id, Delta = credit,
                Reason = LedgerReason.PurchaseCredit, PaymentId = paymentId,
                CreatedBy = actor, Note = type.Name, CreatedAt = now
            });
            pass.Balance = credit;
        }

        audit.Record(actor, "assign_pass", "pass", pass.Id, new { type.Name, credit, i.RegisterPayment });
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return pass.Id;
    }

    /// <summary>Cobra una cuponera que se había entregado impaga (registra el pago y la marca paga).</summary>
    public async Task<Guid> PayPassAsync(Guid passId, string? method, Guid actor, CancellationToken ct = default)
    {
        var pass = await db.Passes.Include(p => p.PassType).FirstOrDefaultAsync(p => p.Id == passId, ct)
            ?? throw new InvalidOperationException("Cuponera no encontrada.");
        if (pass.IsPaid) throw new InvalidOperationException("La cuponera ya está paga.");

        var now = clock.UtcNow;
        var payment = new Payment
        {
            Id = Guid.NewGuid(),
            StudentId = pass.StudentId,
            Amount = pass.PassType.Price,
            Method = string.IsNullOrWhiteSpace(method) ? "efectivo" : method!,
            Status = PaymentStatus.Confirmed,
            PassId = pass.Id,
            Concept = pass.PassType.Name,
            PaidAt = clock.LocalToday(),
            ConfirmedBy = actor,
            CreatedAt = now,
            UpdatedAt = now
        };
        db.Payments.Add(payment);
        pass.IsPaid = true;
        pass.UpdatedAt = now;
        audit.Record(actor, "pay_pass", "pass", pass.Id, new { pass.PassType.Price });
        await db.SaveChangesAsync(ct);
        return payment.Id;
    }

    /// <summary>Extiende una cuponera: agrega días de vigencia y/o clases (crédito por ledger).</summary>
    public async Task ExtendPassAsync(Guid passId, ExtendPassInput i, Guid actor, CancellationToken ct = default)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var pass = await db.Passes.FirstOrDefaultAsync(p => p.Id == passId, ct)
            ?? throw new InvalidOperationException("Cuponera no encontrada.");
        var now = clock.UtcNow;
        var today = clock.LocalToday();

        if (i.ExtraDays > 0)
        {
            var basis = pass.ValidTo < today ? today : pass.ValidTo;
            pass.ValidTo = basis.AddDays(i.ExtraDays);
            if (pass.Status == PassStatus.Expired && pass.ValidTo >= today)
                pass.Status = PassStatus.Active;
        }

        if (i.ExtraClasses > 0)
        {
            db.LedgerEntries.Add(new PassLedgerEntry
            {
                Id = Guid.NewGuid(), PassId = pass.Id, Delta = i.ExtraClasses,
                Reason = LedgerReason.Extension, CreatedBy = actor, Note = i.Reason, CreatedAt = now
            });
            pass.Balance += i.ExtraClasses;
            if (pass.Status == PassStatus.Exhausted && pass.Balance > 0)
                pass.Status = PassStatus.Active;
        }

        pass.UpdatedAt = now;
        audit.Record(actor, "extend_pass", "pass", pass.Id, new { i.ExtraDays, i.ExtraClasses, i.Reason });
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
    }

    /// <summary>Registra un pago manual (confirmado o pendiente).</summary>
    public async Task<Guid> RegisterPaymentAsync(RegisterPaymentInput i, Guid actor, CancellationToken ct = default)
    {
        if (!await db.Students.AnyAsync(s => s.Id == i.StudentId, ct))
            throw new InvalidOperationException("Alumno no encontrado.");
        if (i.Amount <= 0) throw new InvalidOperationException("El monto debe ser mayor a cero.");

        var now = clock.UtcNow;
        var payment = new Payment
        {
            Id = Guid.NewGuid(),
            StudentId = i.StudentId,
            Amount = i.Amount,
            Method = string.IsNullOrWhiteSpace(i.Method) ? "efectivo" : i.Method,
            Status = i.Confirmed ? PaymentStatus.Confirmed : PaymentStatus.Pending,
            PassId = i.PassId,
            Concept = i.Concept,
            PaidAt = i.Confirmed ? clock.LocalToday() : null,
            ConfirmedBy = i.Confirmed ? actor : null,
            CreatedAt = now,
            UpdatedAt = now
        };
        db.Payments.Add(payment);
        audit.Record(actor, "register_payment", "payment", payment.Id, new { i.Amount, i.Method, i.Confirmed });
        await db.SaveChangesAsync(ct);
        return payment.Id;
    }

    /// <summary>Lista los pagos en estado Pendiente (para confirmarlos o cancelarlos).</summary>
    public async Task<List<PendingPaymentDto>> ListPendingPaymentsAsync(CancellationToken ct = default)
    {
        var list = await db.Payments
            .Where(p => p.Status == PaymentStatus.Pending)
            .Select(p => new PendingPaymentDto(
                p.Id, p.StudentId, p.Student.User.FullName,
                p.Amount, p.Method, p.Concept, p.CreatedAt))
            .ToListAsync(ct);
        return list.OrderByDescending(p => p.CreatedAt).ToList();
    }

    /// <summary>Confirma un pago pendiente. Si estaba ligado a una cuponera, la marca como paga.</summary>
    public async Task ConfirmPaymentAsync(Guid paymentId, Guid actor, CancellationToken ct = default)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var payment = await db.Payments.FirstOrDefaultAsync(p => p.Id == paymentId, ct)
            ?? throw new InvalidOperationException("Pago no encontrado.");
        if (payment.Status != PaymentStatus.Pending)
            throw new InvalidOperationException("Sólo se pueden confirmar pagos pendientes.");

        var now = clock.UtcNow;
        payment.Status = PaymentStatus.Confirmed;
        payment.PaidAt = clock.LocalToday();
        payment.ConfirmedBy = actor;
        payment.UpdatedAt = now;

        if (payment.PassId is Guid passId)
        {
            var pass = await db.Passes.FirstOrDefaultAsync(p => p.Id == passId, ct);
            if (pass is not null) { pass.IsPaid = true; pass.UpdatedAt = now; }
        }

        audit.Record(actor, "confirm_payment", "payment", payment.Id, new { payment.Amount });
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
    }

    /// <summary>Cancela un pago pendiente (no se puede cancelar uno ya confirmado).</summary>
    public async Task CancelPaymentAsync(Guid paymentId, Guid actor, CancellationToken ct = default)
    {
        var payment = await db.Payments.FirstOrDefaultAsync(p => p.Id == paymentId, ct)
            ?? throw new InvalidOperationException("Pago no encontrado.");
        if (payment.Status == PaymentStatus.Confirmed)
            throw new InvalidOperationException("No se puede cancelar un pago ya confirmado.");

        payment.Status = PaymentStatus.Cancelled;
        payment.UpdatedAt = clock.UtcNow;
        audit.Record(actor, "cancel_payment", "payment", payment.Id, null);
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Lista alumnos con deuda (saldos negativos + asistencias confirmadas no cubiertas, D12).</summary>
    public async Task<List<DebtorDto>> ListDebtorsAsync(CancellationToken ct = default)
    {
        var today = clock.LocalToday();

        var neg = await db.Passes.Where(p => p.Balance < 0)
            .GroupBy(p => p.StudentId)
            .Select(g => new { StudentId = g.Key, Debt = g.Sum(p => -p.Balance) })
            .ToListAsync(ct);

        var uncovered = await db.Attendances
            .Where(a => a.Status == AttendanceStatus.Confirmed && a.PassId == null && !a.CoveredByUnlimited)
            .GroupBy(a => a.StudentId)
            .Select(g => new { StudentId = g.Key, Cnt = g.Count() })
            .ToListAsync(ct);

        var pending = await db.Attendances.Where(a => a.Status == AttendanceStatus.Pending)
            .GroupBy(a => a.StudentId).Select(g => new { StudentId = g.Key, Cnt = g.Count() })
            .ToListAsync(ct);

        var remaining = await db.Passes
            .Where(p => p.Kind == PassKind.ClassPack && p.Status == PassStatus.Active && p.ValidTo >= today && p.Balance > 0)
            .GroupBy(p => p.StudentId).Select(g => new { StudentId = g.Key, Rem = g.Sum(p => p.Balance) })
            .ToListAsync(ct);

        // Deuda de dinero: cuponeras impagas (no canceladas) por alumno.
        var money = await db.Passes
            .Where(p => !p.IsPaid && p.Status != PassStatus.Cancelled)
            .GroupBy(p => p.StudentId).Select(g => new { StudentId = g.Key, Amount = g.Sum(p => p.PassType.Price) })
            .ToListAsync(ct);

        var debtorIds = neg.Select(x => x.StudentId)
            .Union(uncovered.Select(x => x.StudentId))
            .Union(money.Select(x => x.StudentId))
            .Distinct().ToList();
        if (debtorIds.Count == 0) return [];

        var names = await db.Students.Where(s => debtorIds.Contains(s.Id))
            .Select(s => new { s.Id, s.User.FullName }).ToListAsync(ct);

        return names.Select(s =>
        {
            var debt = (neg.FirstOrDefault(x => x.StudentId == s.Id)?.Debt ?? 0)
                       + (uncovered.FirstOrDefault(x => x.StudentId == s.Id)?.Cnt ?? 0);
            var debtMoney = money.FirstOrDefault(x => x.StudentId == s.Id)?.Amount ?? 0m;
            return new DebtorDto(s.Id, s.FullName, debt,
                pending.FirstOrDefault(x => x.StudentId == s.Id)?.Cnt ?? 0,
                remaining.FirstOrDefault(x => x.StudentId == s.Id)?.Rem ?? 0,
                debtMoney);
        })
        .Where(d => d.DebtClasses > 0 || d.DebtMoney > 0)
        .OrderByDescending(d => d.DebtMoney)
        .ThenByDescending(d => d.DebtClasses)
        .ToList();
    }
}
