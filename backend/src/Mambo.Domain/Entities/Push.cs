namespace Mambo.Domain.Entities;

/// <summary>
/// Suscripción Web Push de un dispositivo/navegador a un usuario. Cada dispositivo
/// (endpoint del navegador) es una fila; un usuario puede tener varias (celular,
/// tablet, PC). El endpoint es único: si el navegador re-suscribe, se actualiza la
/// fila existente en vez de duplicar. Se limpian solas cuando el push da 404/410
/// (suscripción vencida/revocada por el navegador).
/// </summary>
public class PushSubscription
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }

    /// <summary>URL única del navegador a la que se envía el push (anclaje de idempotencia).</summary>
    public string Endpoint { get; set; } = default!;

    /// <summary>Clave pública del cliente (para cifrar el payload).</summary>
    public string P256dh { get; set; } = default!;

    /// <summary>Secreto de autenticación del cliente (para cifrar el payload).</summary>
    public string Auth { get; set; } = default!;

    public string? UserAgent { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime LastUsedAt { get; set; }

    /// <summary>Fallos de envío consecutivos; a partir de un umbral se elimina la fila.</summary>
    public int FailureCount { get; set; }

    public AppUser User { get; set; } = default!;
}
