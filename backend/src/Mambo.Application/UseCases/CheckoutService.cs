using Mambo.Application.Abstractions;
using Mambo.Domain;
using Mambo.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Mambo.Application.UseCases;

public record CheckoutStartResult(Guid IntentId, string InitPoint);
public record CheckoutIntentDto(Guid Id, string Status, decimal Amount, string PassTypeName, string? FailureReason, DateTime CreatedAt);

/// <summary>
/// Compra de cuponeras por pasarela (Mercado Pago, Checkout Pro).
///
/// Reglas duras:
///  - El PRECIO sale SIEMPRE del catálogo del backend. El cliente solo elige QUÉ comprar
///    (passTypeId); nunca manda un importe.
///  - La cuponera se entrega SOLO cuando la pasarela confirma el pago como aprobado,
///    y el estado se consulta contra SU API (el cuerpo del webhook no es confiable).
///  - Todo es idempotente: un webhook repetido no entrega dos cuponeras.
/// </summary>
public class CheckoutService(
    IMamboDbContext db, IClock clock, IAuditService audit,
    IPaymentGateway gateway, BillingService billing)
{
    public bool IsEnabled => gateway.IsConfigured;

    /// <summary>
    /// Inicia la compra: congela el precio del catálogo en un intento propio y crea la
    /// preferencia en la pasarela. Devuelve a dónde mandar al alumno a pagar.
    /// </summary>
    public async Task<CheckoutStartResult> StartAsync(Guid studentId, Guid passTypeId, CancellationToken ct = default)
    {
        if (!gateway.IsConfigured)
            throw new InvalidOperationException("El pago online todavía no está disponible.");

        var student = await db.Students.Include(s => s.User)
            .FirstOrDefaultAsync(s => s.Id == studentId && s.IsActive, ct)
            ?? throw new InvalidOperationException("Alumno no encontrado o inactivo.");

        var type = await db.PassTypes.FirstOrDefaultAsync(t => t.Id == passTypeId && t.IsActive, ct)
            ?? throw new InvalidOperationException("Tipo de cuponera no encontrado.");

        // Se valida ACÁ además de al aprobar: mejor frenar antes de cobrarle que
        // devolverle la plata después.
        await EnsureCanBuyAsync(studentId, type, ct);

        var now = clock.UtcNow;
        var intent = new PaymentIntent
        {
            Id = Guid.NewGuid(),
            StudentId = studentId,
            PassTypeId = type.Id,
            Amount = type.Price,      // snapshot del catálogo: la fuente de verdad del importe
            Status = PaymentIntentStatus.Pending,
            CreatedAt = now,
            UpdatedAt = now
        };
        db.PaymentIntents.Add(intent);
        await db.SaveChangesAsync(ct);

        var pref = await gateway.CreatePreferenceAsync(intent.Id, type.Name, type.Price, student.User.Email, ct);

        intent.PreferenceId = pref.PreferenceId;
        intent.UpdatedAt = clock.UtcNow;
        await db.SaveChangesAsync(ct);

        audit.Record(student.UserId, "checkout_start", "payment_intent", intent.Id,
            new { type.Name, type.Price });

        return new CheckoutStartResult(intent.Id, pref.InitPoint);
    }

    /// <summary>
    /// Procesa la notificación de la pasarela. IDEMPOTENTE: se puede llamar N veces con el
    /// mismo pago y la cuponera se entrega una sola vez.
    /// Devuelve true si el pago quedó aprobado (para poder loguearlo/testearlo).
    /// </summary>
    public async Task<bool> HandleGatewayNotificationAsync(string externalPaymentId, CancellationToken ct = default)
    {
        if (!gateway.IsConfigured) return false;

        // El webhook solo trae el id: el estado y el importe se consultan contra la pasarela.
        var payment = await gateway.GetPaymentAsync(externalPaymentId, ct);
        if (payment is null) return false;

        if (!Guid.TryParse(payment.ExternalReference, out var intentId))
            return false; // no es un pago nuestro

        var intent = await db.PaymentIntents.Include(x => x.PassType)
            .FirstOrDefaultAsync(x => x.Id == intentId, ct);
        if (intent is null) return false;

        // Ya resuelto: webhook repetido. No se vuelve a tocar nada.
        if (intent.Status != PaymentIntentStatus.Pending)
            return intent.Status == PaymentIntentStatus.Approved;

        var estado = payment.Status?.ToLowerInvariant();

        if (estado != "approved")
        {
            await ResolveAsync(intent, estado switch
            {
                "rejected" => PaymentIntentStatus.Rejected,
                "cancelled" or "refunded" or "charged_back" => PaymentIntentStatus.Cancelled,
                _ => PaymentIntentStatus.Pending   // "pending"/"in_process": todavía no se define
            }, payment, reason: payment.StatusDetail, ct);
            return false;
        }

        // NUNCA aceptar que se pague de menos: el importe válido es el snapshot del catálogo,
        // no lo que informe el cliente ni lo que se haya podido manipular en el checkout.
        if (payment.Amount < intent.Amount)
        {
            await ResolveAsync(intent, PaymentIntentStatus.Rejected, payment,
                reason: $"Importe insuficiente: se pagó {payment.Amount} y la cuponera vale {intent.Amount}.", ct);
            audit.Record(null, "checkout_underpaid", "payment_intent", intent.Id,
                new { esperado = intent.Amount, recibido = payment.Amount });
            return false;
        }

        return await ApproveAsync(intent, payment, ct);
    }

    /// <summary>Entrega la cuponera y marca el intento aprobado, todo en una transacción.</summary>
    private async Task<bool> ApproveAsync(PaymentIntent intent, GatewayPayment payment, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);

        // RECLAMO ATÓMICO: dos webhooks simultáneos del mismo pago leen ambos "Pending".
        // Solo uno debe entregar la cuponera.
        var claimed = await db.PaymentIntents
            .Where(x => x.Id == intent.Id && x.Status == PaymentIntentStatus.Pending)
            .ExecuteUpdateAsync(s => s
                .SetProperty(x => x.Status, PaymentIntentStatus.Approved)
                .SetProperty(x => x.ExternalPaymentId, payment.ExternalPaymentId)
                .SetProperty(x => x.UpdatedAt, clock.UtcNow), ct);

        if (claimed == 0)
        {
            await tx.RollbackAsync(ct);
            return true; // otro webhook ya lo aprobó y entregó
        }

        var (passId, paymentId) = await billing.AssignPassCoreAsync(
            new AssignPassInput(intent.StudentId, intent.PassTypeId, RegisterPayment: true, PaymentMethod: "mercadopago"),
            actor: intent.StudentId, ct);

        await db.PaymentIntents.Where(x => x.Id == intent.Id)
            .ExecuteUpdateAsync(s => s
                .SetProperty(x => x.PassId, passId)
                .SetProperty(x => x.PaymentId, paymentId), ct);

        audit.Record(null, "checkout_approved", "payment_intent", intent.Id,
            new { payment.ExternalPaymentId, intent.Amount, passId });

        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return true;
    }

    private async Task ResolveAsync(PaymentIntent intent, PaymentIntentStatus status,
        GatewayPayment payment, string? reason, CancellationToken ct)
    {
        if (status == PaymentIntentStatus.Pending) return; // sigue en curso: nada que resolver

        intent.Status = status;
        intent.ExternalPaymentId = payment.ExternalPaymentId;
        intent.FailureReason = reason;
        intent.UpdatedAt = clock.UtcNow;
        await db.SaveChangesAsync(ct);

        audit.Record(null, "checkout_" + status.ToString().ToLowerInvariant(), "payment_intent", intent.Id,
            new { reason });
    }

    /// <summary>Últimos intentos del alumno (para mostrarle el estado de su compra).</summary>
    public async Task<List<CheckoutIntentDto>> ListMineAsync(Guid studentId, CancellationToken ct = default)
    {
        var raw = await db.PaymentIntents
            .Where(x => x.StudentId == studentId)
            .OrderByDescending(x => x.CreatedAt)
            .Take(10)
            .Select(x => new { x.Id, x.Status, x.Amount, PassTypeName = x.PassType.Name, x.FailureReason, x.CreatedAt })
            .ToListAsync(ct);

        // ToString() del enum EN MEMORIA: dentro del SQL, Postgres devolvería la etiqueta
        // snake_case del enum en vez del nombre C# (mismo criterio que el fix F6).
        return raw.Select(x => new CheckoutIntentDto(
            x.Id, x.Status.ToString(), x.Amount, x.PassTypeName, x.FailureReason, x.CreatedAt)).ToList();
    }

    /// <summary>Mismas reglas que la entrega manual: no duplicar una cuponera activa del mismo tipo.</summary>
    private async Task EnsureCanBuyAsync(Guid studentId, PassType type, CancellationToken ct)
    {
        var today = clock.LocalToday();
        var yaTiene = await db.Passes.AnyAsync(p =>
            p.StudentId == studentId && p.PassTypeId == type.Id &&
            p.Status == PassStatus.Active && p.ValidFrom <= today && p.ValidTo >= today, ct);

        if (yaTiene)
            throw new InvalidOperationException(
                $"Ya tenés una cuponera activa y vigente de tipo \"{type.Name}\".");
    }
}
