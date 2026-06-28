namespace Mambo.Domain.Entities;

/// <summary>Token dinámico de corta vida para check-in/out seguro por QR.</summary>
public class QrToken
{
    public Guid Id { get; set; }
    public string Token { get; set; } = default!;
    public string Purpose { get; set; } = default!; // academy_display | student_checkin
    public Guid? ClassSessionId { get; set; }
    public Guid? StudentId { get; set; }
    public DateTime ExpiresAt { get; set; }
    public DateTime? UsedAt { get; set; }
    public DateTime CreatedAt { get; set; }
}

/// <summary>Registro de auditoría de acciones sensibles.</summary>
public class AuditLog
{
    public Guid Id { get; set; }
    public Guid? ActorUserId { get; set; }
    public string Action { get; set; } = default!;
    public string EntityType { get; set; } = default!;
    public Guid EntityId { get; set; }
    public string? Detail { get; set; }             // jsonb serializado
    public DateTime CreatedAt { get; set; }
}
