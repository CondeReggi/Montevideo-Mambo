namespace Mambo.Domain.Entities;

/// <summary>
/// Intento de compra de una cuponera por pasarela (Mercado Pago, Checkout Pro).
/// Es NUESTRO registro del intento: la fuente de verdad del importe es este snapshot
/// (tomado del catálogo al iniciar el checkout), NUNCA lo que informe el cliente.
/// La cuponera se entrega recién cuando el pago llega aprobado por webhook.
/// </summary>
public class PaymentIntent
{
    public Guid Id { get; set; }
    public Guid StudentId { get; set; }
    public Guid PassTypeId { get; set; }

    /// <summary>Precio del catálogo CONGELADO al iniciar el checkout (si luego cambia, este intento respeta el suyo).</summary>
    public decimal Amount { get; set; }

    public PaymentIntentStatus Status { get; set; } = PaymentIntentStatus.Pending;

    /// <summary>Id de la preferencia de Mercado Pago (lo que se abre en el checkout).</summary>
    public string? PreferenceId { get; set; }

    /// <summary>Id del pago de Mercado Pago. UNIQUE: es el ancla de idempotencia ante webhooks repetidos.</summary>
    public string? ExternalPaymentId { get; set; }

    /// <summary>Cuponera entregada al aprobarse (null mientras no se aprobó).</summary>
    public Guid? PassId { get; set; }

    /// <summary>Pago registrado al aprobarse (null mientras no se aprobó).</summary>
    public Guid? PaymentId { get; set; }

    /// <summary>Motivo de rechazo/cancelación, para poder explicárselo al alumno.</summary>
    public string? FailureReason { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public Student Student { get; set; } = default!;
    public PassType PassType { get; set; } = default!;
}
