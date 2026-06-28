namespace Mambo.Domain.Entities;

/// <summary>Pago manual registrado por administración (sin pasarela).</summary>
public class Payment
{
    public Guid Id { get; set; }
    public Guid StudentId { get; set; }
    public decimal Amount { get; set; }
    public string Method { get; set; } = default!;  // efectivo, transferencia, etc.
    public PaymentStatus Status { get; set; } = PaymentStatus.Pending;
    public Guid? PassId { get; set; }
    public string? Concept { get; set; }
    public DateOnly? PaidAt { get; set; }
    public Guid? ConfirmedBy { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public Student Student { get; set; } = default!;
}
