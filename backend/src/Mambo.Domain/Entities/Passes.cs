namespace Mambo.Domain.Entities;

/// <summary>Catálogo de cuponeras.</summary>
public class PassType
{
    public Guid Id { get; set; }
    public string Name { get; set; } = default!;
    public PassKind Kind { get; set; }
    public int? ClassCount { get; set; }            // N para pack; null para pase libre / suelta
    public decimal Price { get; set; }
    public int ValidityDays { get; set; } = 30;     // 30 días corridos desde la compra
    public bool IsActive { get; set; } = true;
}

/// <summary>Cuponera comprada por un alumno.</summary>
public class Pass
{
    public Guid Id { get; set; }
    public Guid StudentId { get; set; }
    public Guid PassTypeId { get; set; }
    public PassKind Kind { get; set; }              // snapshot del tipo
    public int? InitialCount { get; set; }
    public int Balance { get; set; }                // caché = suma del ledger; puede ser negativo
    public DateOnly ValidFrom { get; set; }
    public DateOnly ValidTo { get; set; }
    public PassStatus Status { get; set; } = PassStatus.Active;
    public bool IsPaid { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public Student Student { get; set; } = default!;
    public PassType PassType { get; set; } = default!;
    public ICollection<PassLedgerEntry> Ledger { get; set; } = new List<PassLedgerEntry>();

    /// <summary>¿Está vigente a la fecha dada (estado activo y dentro del rango)?</summary>
    public bool IsValidOn(DateOnly date) =>
        Status == PassStatus.Active && date >= ValidFrom && date <= ValidTo;
}

/// <summary>Movimiento del ledger de cuponera. Inmutable: las correcciones crean filas compensatorias.</summary>
public class PassLedgerEntry
{
    public Guid Id { get; set; }
    public Guid PassId { get; set; }
    public int Delta { get; set; }                  // +créditos / -consumos
    public LedgerReason Reason { get; set; }
    public Guid? AttendanceId { get; set; }
    public Guid? PaymentId { get; set; }
    public Guid? CreatedBy { get; set; }
    public string? Note { get; set; }
    public DateTime CreatedAt { get; set; }

    public Pass Pass { get; set; } = default!;
}
