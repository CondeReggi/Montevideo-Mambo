using Mambo.Api.Auth;
using Mambo.Application.Abstractions;
using Mambo.Application.UseCases;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Mambo.Api.Controllers;

/// <summary>
/// Compra de cuponeras por Mercado Pago (Checkout Pro).
/// El alumno solo elige QUÉ comprar; el precio lo pone el backend desde el catálogo.
/// </summary>
[ApiController]
[Route("api")]
public class CheckoutController(
    IMamboDbContext db,
    CheckoutService checkout,
    BillingService billing,
    ILogger<CheckoutController> log,
    ICurrentUser me) : ControllerBase
{
    public record StartRequest(Guid PassTypeId);

    /// <summary>
    /// ¿Está disponible el pago online? Lo consulta el front para decidir entre mostrar
    /// el botón de comprar o el cartel de "próximamente".
    /// </summary>
    [HttpGet("checkout/availability")]
    [AllowAnonymous]
    public IActionResult Availability() => Ok(new { enabled = checkout.IsEnabled });

    /// <summary>Catálogo de cuponeras que el alumno puede comprar (precio del backend).</summary>
    [HttpGet("me/passtypes")]
    [Authorize]
    public async Task<IActionResult> PassTypes(CancellationToken ct) =>
        Ok(await billing.ListPassTypesAsync(ct));

    /// <summary>Inicia la compra: devuelve la URL de Mercado Pago a la que hay que ir a pagar.</summary>
    [HttpPost("me/checkout")]
    [Authorize]
    public async Task<IActionResult> Start([FromBody] StartRequest req, CancellationToken ct)
    {
        var studentId = await MyStudentIdAsync(ct);
        if (studentId is null) return NotFound(new { error = "El usuario no es un alumno." });

        if (!checkout.IsEnabled)
            return StatusCode(StatusCodes.Status503ServiceUnavailable,
                new { error = "El pago online todavía no está disponible." });

        try
        {
            var res = await checkout.StartAsync(studentId.Value, req.PassTypeId, ct);
            return Ok(res);
        }
        catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
    }

    /// <summary>Mis compras por pasarela y su estado.</summary>
    [HttpGet("me/checkout")]
    [Authorize]
    public async Task<IActionResult> Mine(CancellationToken ct)
    {
        var studentId = await MyStudentIdAsync(ct);
        if (studentId is null) return NotFound(new { error = "El usuario no es un alumno." });
        return Ok(await checkout.ListMineAsync(studentId.Value, ct));
    }

    /// <summary>
    /// Webhook de Mercado Pago. Es ANÓNIMO (lo llama MP, no un usuario) y por eso NO se
    /// confía en su cuerpo: solo se toma el id del pago y el estado real se consulta
    /// contra la API de MP. Idempotente: MP reintenta ante cualquier error o timeout.
    /// Siempre responde 200: un 4xx/5xx haría que MP reintente en loop por algo que no
    /// se va a arreglar solo (y el backend en Render free puede tardar en despertar).
    /// </summary>
    [HttpPost("webhooks/mercadopago")]
    [AllowAnonymous]
    public async Task<IActionResult> Webhook([FromQuery(Name = "data.id")] string? dataId,
        [FromQuery] string? type, [FromBody] WebhookBody? body, CancellationToken ct)
    {
        // MP notifica de varias formas según la integración; se aceptan las dos habituales.
        var paymentId = dataId ?? body?.Data?.Id;
        var topic = type ?? body?.Type ?? body?.Action;

        if (string.IsNullOrWhiteSpace(paymentId)) return Ok();
        if (topic is not null && !topic.Contains("payment", StringComparison.OrdinalIgnoreCase)) return Ok();

        try
        {
            await checkout.HandleGatewayNotificationAsync(paymentId, ct);
        }
        catch (Exception ex)
        {
            // No se propaga: se registra para reconciliar a mano. Ver nota de idempotencia.
            log.LogError(ex, "Falló el procesamiento del webhook de Mercado Pago para el pago {PaymentId}.", paymentId);
        }
        return Ok();
    }

    public record WebhookBody(string? Type, string? Action, WebhookData? Data);
    public record WebhookData(string? Id);

    private async Task<Guid?> MyStudentIdAsync(CancellationToken ct)
    {
        var userId = me.UserIdOrThrow();
        var id = await db.Students.Where(s => s.UserId == userId).Select(s => s.Id).FirstOrDefaultAsync(ct);
        return id == Guid.Empty ? null : id;
    }
}
