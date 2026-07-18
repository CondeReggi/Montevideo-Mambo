using System.Net;
using System.Text.Json;
using Mambo.Application.Abstractions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using WebPush;
using LibPushSubscription = WebPush.PushSubscription;

namespace Mambo.Infrastructure.Services;

/// <summary>
/// Envío Web Push (VAPID) con la librería WebPush (cifrado aes128gcm + firma VAPID).
/// No se hace cripto a mano: el cifrado del payload y la firma son delicados.
///
/// Si no hay claves VAPID, IsConfigured=false y la app no ofrece notificaciones
/// (mismo criterio que Mercado Pago). Las claves se generan una vez y se cargan por
/// variable de entorno (NUNCA en el repo):
///   Push__VapidPublicKey   (base64url; también la usa el frontend para suscribirse)
///   Push__VapidPrivateKey  (base64url; SECRETO)
///   Push__Subject          (mailto:... o URL de contacto; requerido por el estándar)
/// Generar el par: ver README/bitácora (WebPush VapidHelper.GenerateVapidKeys()).
/// </summary>
public class WebPushSender(IConfiguration config, ILogger<WebPushSender> log) : IPushSender
{
    private readonly WebPushClient _client = new();

    private string? PrivateKey => config["Push:VapidPrivateKey"];
    private string Subject => config["Push:Subject"] ?? "mailto:mambo@montevideomambo.uy";

    public string? PublicKey => config["Push:VapidPublicKey"];

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(PublicKey) && !string.IsNullOrWhiteSpace(PrivateKey);

    public async Task<PushDeliveryResult> SendAsync(PushDevice device, PushMessage message, CancellationToken ct = default)
    {
        if (!IsConfigured) return PushDeliveryResult.Error;

        var payload = JsonSerializer.Serialize(new
        {
            title = message.Title,
            body = message.Body,
            url = message.Url,
            tag = message.Tag,
        });

        var subscription = new LibPushSubscription(device.Endpoint, device.P256dh, device.Auth);
        var vapid = new VapidDetails(Subject, PublicKey, PrivateKey);

        try
        {
            await _client.SendNotificationAsync(subscription, payload, vapid);
            return PushDeliveryResult.Ok;
        }
        catch (WebPushException ex)
        {
            // 404/410: el navegador ya no acepta esta suscripción → hay que borrarla.
            if (ex.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.Gone)
                return PushDeliveryResult.Gone;

            log.LogWarning(ex, "Fallo al enviar push ({Status})", ex.StatusCode);
            return PushDeliveryResult.Error;
        }
        catch (Exception ex)
        {
            log.LogWarning(ex, "Error inesperado enviando push");
            return PushDeliveryResult.Error;
        }
    }
}
