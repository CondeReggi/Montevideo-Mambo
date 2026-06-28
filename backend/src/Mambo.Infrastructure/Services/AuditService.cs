using System.Text.Json;
using Mambo.Application.Abstractions;
using Mambo.Domain.Entities;

namespace Mambo.Infrastructure.Services;

/// <summary>Acumula entradas de auditoría en el contexto; se persisten con el SaveChanges del caso de uso.</summary>
public class AuditService(IMamboDbContext db, IClock clock) : IAuditService
{
    public void Record(Guid? actorUserId, string action, string entityType, Guid entityId, object? detail = null)
    {
        db.AuditLogs.Add(new AuditLog
        {
            Id = Guid.NewGuid(),
            ActorUserId = actorUserId,
            Action = action,
            EntityType = entityType,
            EntityId = entityId,
            Detail = detail is null ? null : JsonSerializer.Serialize(detail),
            CreatedAt = clock.UtcNow
        });
    }
}
