namespace Mambo.Application.Abstractions;

/// <summary>Datos de un dispositivo suscripto (los que entrega el navegador al suscribirse).</summary>
public record PushDevice(string Endpoint, string P256dh, string Auth);

/// <summary>Contenido de la notificación. Url = a dónde ir al tocarla; Tag = agrupa/colapsa.</summary>
public record PushMessage(string Title, string Body, string? Url = null, string? Tag = null);

/// <summary>
/// Resultado del envío a UN dispositivo. Gone = el navegador ya no acepta esta
/// suscripción (404/410) → hay que borrarla. Error = fallo transitorio.
/// </summary>
public enum PushDeliveryResult { Ok, Gone, Error }

/// <summary>
/// Envío Web Push (VAPID). Lo implementa Infrastructure con la librería de cripto;
/// Application solo depende de esta abstracción. Si no hay claves VAPID configuradas,
/// IsConfigured=false y la app no ofrece notificaciones (mismo criterio que Mercado Pago).
/// </summary>
public interface IPushSender
{
    bool IsConfigured { get; }

    /// <summary>Clave pública VAPID (base64url) que el frontend usa para suscribirse. Null si no está configurado.</summary>
    string? PublicKey { get; }

    Task<PushDeliveryResult> SendAsync(PushDevice device, PushMessage message, CancellationToken ct = default);
}
