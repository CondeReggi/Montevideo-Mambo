using Mambo.Api.Auth;
using Mambo.Application.Abstractions;
using Mambo.Application.UseCases;
using Mambo.Domain;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Mambo.Api.Controllers;

/// <summary>
/// Notificaciones push (Web Push/VAPID). El navegador se suscribe y manda su
/// endpoint+claves; el backend las guarda contra el usuario autenticado. El envío
/// de difusión (a un rol o a todos) solo lo puede disparar admin.
/// </summary>
[ApiController]
[Route("api")]
public class PushController(PushService push, ICurrentUser me, ILogger<PushController> log) : ControllerBase
{
    // Forma en que el navegador serializa la suscripción (PushSubscription.toJSON()).
    public record Keys(string P256dh, string Auth);
    public record SubscribeRequest(string Endpoint, Keys Keys);
    public record UnsubscribeRequest(string Endpoint);
    public record BroadcastRequest(string Title, string Body, string? Url, string? Target);

    /// <summary>
    /// ¿Están habilitadas las notificaciones? Devuelve también la clave pública VAPID
    /// que el frontend necesita para suscribirse. El front lo consulta antes de ofrecer
    /// el botón de activar (si enabled=false, no lo muestra).
    /// </summary>
    [HttpGet("push/vapid-public-key")]
    [AllowAnonymous]
    public IActionResult VapidPublicKey() =>
        Ok(new { enabled = push.IsEnabled, publicKey = push.PublicKey });

    /// <summary>Registra el dispositivo actual para recibir notificaciones.</summary>
    [HttpPost("push/subscribe")]
    [Authorize]
    public async Task<IActionResult> Subscribe([FromBody] SubscribeRequest req, CancellationToken ct)
    {
        if (!push.IsEnabled)
            return StatusCode(StatusCodes.Status503ServiceUnavailable,
                new { error = "Las notificaciones todavía no están disponibles." });
        try
        {
            var ua = Request.Headers.UserAgent.ToString();
            await push.SubscribeAsync(me.UserIdOrThrow(),
                new PushDevice(req.Endpoint, req.Keys.P256dh, req.Keys.Auth),
                string.IsNullOrWhiteSpace(ua) ? null : ua, ct);
            return NoContent();
        }
        catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
    }

    /// <summary>Da de baja este dispositivo (al desactivar las notificaciones).</summary>
    [HttpPost("push/unsubscribe")]
    [Authorize]
    public async Task<IActionResult> Unsubscribe([FromBody] UnsubscribeRequest req, CancellationToken ct)
    {
        await push.UnsubscribeAsync(req.Endpoint, ct);
        return NoContent();
    }

    /// <summary>Envía una notificación de prueba al propio usuario (para verificar el permiso).</summary>
    [HttpPost("push/test")]
    [Authorize]
    public async Task<IActionResult> Test(CancellationToken ct)
    {
        var sent = await push.SendToUserAsync(me.UserIdOrThrow(),
            new PushMessage("MAMBO", "¡Notificaciones activadas! 💚", "/me", "test"), ct);
        return Ok(new { sent });
    }

    /// <summary>Difusión desde admin: a todos, o solo alumnos o solo profesores.</summary>
    [HttpPost("admin/push/broadcast")]
    [Authorize(Policy = "Admin")]
    public async Task<IActionResult> Broadcast([FromBody] BroadcastRequest req, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.Title) || string.IsNullOrWhiteSpace(req.Body))
            return BadRequest(new { error = "Título y mensaje son obligatorios." });

        var msg = new PushMessage(req.Title.Trim(), req.Body.Trim(),
            string.IsNullOrWhiteSpace(req.Url) ? "/me" : req.Url, "broadcast");

        var sent = (req.Target ?? "all").ToLowerInvariant() switch
        {
            "students" => await push.SendToRoleAsync(AppRole.Student, msg, ct),
            "teachers" => await push.SendToRoleAsync(AppRole.Teacher, msg, ct),
            _ => await push.SendToAllAsync(msg, ct),
        };
        log.LogInformation("Broadcast push enviado a {Count} dispositivos (target={Target}).", sent, req.Target);
        return Ok(new { sent });
    }
}
