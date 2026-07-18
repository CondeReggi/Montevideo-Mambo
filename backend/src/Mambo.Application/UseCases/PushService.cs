using Mambo.Application.Abstractions;
using Mambo.Domain;
using Mambo.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Mambo.Application.UseCases;

/// <summary>
/// Notificaciones push (Web Push / VAPID). Administra las suscripciones de los
/// dispositivos y envía notificaciones a un usuario, a un rol (ej. todos los
/// alumnos) o a todos. Las suscripciones vencidas (404/410) se borran solas.
///
/// La validación sensible vive acá: un dispositivo solo se suscribe al usuario
/// autenticado (el controller pasa el userId del token), y los envíos de difusión
/// solo los dispara admin (el controller aplica la policy).
/// </summary>
public class PushService(IMamboDbContext db, IClock clock, IPushSender sender)
{
    private const int MaxFailures = 5;

    public bool IsEnabled => sender.IsConfigured;
    public string? PublicKey => sender.PublicKey;

    /// <summary>Registra (o actualiza) la suscripción de un dispositivo para un usuario.</summary>
    public async Task SubscribeAsync(Guid userId, PushDevice device, string? userAgent, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(device.Endpoint) ||
            string.IsNullOrWhiteSpace(device.P256dh) ||
            string.IsNullOrWhiteSpace(device.Auth))
            throw new InvalidOperationException("Suscripción push incompleta.");

        var now = clock.UtcNow;
        // Endpoint único: si el navegador ya estaba suscripto, se actualiza (puede
        // haber cambiado de usuario en el mismo dispositivo, o rotado las claves).
        var existing = await db.PushSubscriptions.FirstOrDefaultAsync(s => s.Endpoint == device.Endpoint, ct);
        if (existing is not null)
        {
            existing.UserId = userId;
            existing.P256dh = device.P256dh;
            existing.Auth = device.Auth;
            existing.UserAgent = userAgent;
            existing.LastUsedAt = now;
            existing.FailureCount = 0;
        }
        else
        {
            db.PushSubscriptions.Add(new PushSubscription
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                Endpoint = device.Endpoint,
                P256dh = device.P256dh,
                Auth = device.Auth,
                UserAgent = userAgent,
                CreatedAt = now,
                LastUsedAt = now,
                FailureCount = 0
            });
        }
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Borra la suscripción de un dispositivo (al desactivar las notificaciones).</summary>
    public async Task UnsubscribeAsync(string endpoint, CancellationToken ct = default)
    {
        var rows = await db.PushSubscriptions.Where(s => s.Endpoint == endpoint).ToListAsync(ct);
        if (rows.Count == 0) return;
        db.PushSubscriptions.RemoveRange(rows);
        await db.SaveChangesAsync(ct);
    }

    public async Task<int> SendToUserAsync(Guid userId, PushMessage msg, CancellationToken ct = default)
    {
        if (!IsEnabled) return 0;
        var subs = await db.PushSubscriptions.Where(s => s.UserId == userId).ToListAsync(ct);
        return await DispatchAsync(subs, msg, ct);
    }

    /// <summary>Envía a todos los usuarios (activos) con un rol dado. Ej.: todos los alumnos.</summary>
    public async Task<int> SendToRoleAsync(AppRole role, PushMessage msg, CancellationToken ct = default)
    {
        if (!IsEnabled) return 0;
        var subs = await (
            from s in db.PushSubscriptions
            join u in db.Users on s.UserId equals u.Id
            join ur in db.UserRoles on u.Id equals ur.UserId
            join r in db.Roles on ur.RoleId equals r.Id
            where r.Code == role && u.IsActive
            select s).Distinct().ToListAsync(ct);
        return await DispatchAsync(subs, msg, ct);
    }

    public async Task<int> SendToAllAsync(PushMessage msg, CancellationToken ct = default)
    {
        if (!IsEnabled) return 0;
        var subs = await (
            from s in db.PushSubscriptions
            join u in db.Users on s.UserId equals u.Id
            where u.IsActive
            select s).ToListAsync(ct);
        return await DispatchAsync(subs, msg, ct);
    }

    /// <summary>
    /// Envía a una lista de suscripciones y limpia las inservibles. Nunca lanza:
    /// las notificaciones son best-effort y no deben romper la operación que las dispara.
    /// Devuelve cuántas se entregaron OK.
    /// </summary>
    private async Task<int> DispatchAsync(List<PushSubscription> subs, PushMessage msg, CancellationToken ct)
    {
        if (!sender.IsConfigured || subs.Count == 0) return 0;

        var toRemove = new List<PushSubscription>();
        var ok = 0;
        foreach (var s in subs)
        {
            PushDeliveryResult result;
            try
            {
                result = await sender.SendAsync(new PushDevice(s.Endpoint, s.P256dh, s.Auth), msg, ct);
            }
            catch
            {
                result = PushDeliveryResult.Error;
            }

            switch (result)
            {
                case PushDeliveryResult.Ok:
                    s.LastUsedAt = clock.UtcNow;
                    s.FailureCount = 0;
                    ok++;
                    break;
                case PushDeliveryResult.Gone:
                    toRemove.Add(s); // el navegador ya no la acepta: se borra.
                    break;
                default:
                    s.FailureCount++;
                    if (s.FailureCount >= MaxFailures) toRemove.Add(s);
                    break;
            }
        }

        if (toRemove.Count > 0) db.PushSubscriptions.RemoveRange(toRemove);
        await db.SaveChangesAsync(ct);
        return ok;
    }
}
