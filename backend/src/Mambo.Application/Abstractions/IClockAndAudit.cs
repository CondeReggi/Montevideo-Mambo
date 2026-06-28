using Mambo.Domain.Entities;

namespace Mambo.Application.Abstractions;

/// <summary>Reloj inyectable (facilita pruebas y centraliza UTC).</summary>
public interface IClock
{
    DateTime UtcNow { get; }
}

/// <summary>Servicio de auditoría: registra acciones sensibles en audit_log.</summary>
public interface IAuditService
{
    void Record(Guid? actorUserId, string action, string entityType, Guid entityId, object? detail = null);
}
