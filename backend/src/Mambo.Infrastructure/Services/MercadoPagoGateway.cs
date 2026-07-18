using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json.Serialization;
using Mambo.Application.Abstractions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Mambo.Infrastructure.Services;

/// <summary>
/// Mercado Pago — Checkout Pro (el alumno paga en el sitio de MP y vuelve).
/// Se eligió Checkout Pro sobre Bricks porque MP se hace cargo de tarjetas/PCI y no
/// hay que abrir la CSP estricta (SEC-21) para cargar su SDK en el front.
///
/// Si no hay credenciales, IsConfigured devuelve false y la app funciona igual:
/// la UI muestra "próximamente" en vez de ofrecer el pago online.
///
/// Config (por variable de entorno en producción, NUNCA en el repo):
///   MercadoPago__AccessToken  (obligatorio para habilitarlo)
///   MercadoPago__BackUrl      (a dónde vuelve el alumno; por defecto el front)
/// </summary>
public class MercadoPagoGateway(
    IHttpClientFactory httpFactory, IConfiguration config, ILogger<MercadoPagoGateway> log) : IPaymentGateway
{
    private const string DefaultApiBase = "https://api.mercadopago.com";

    private string? AccessToken => config["MercadoPago:AccessToken"];
    // Override solo para pruebas/sandbox; en producción se deja el default.
    private string ApiBase => config["MercadoPago:ApiBase"] ?? DefaultApiBase;

    public bool IsConfigured => !string.IsNullOrWhiteSpace(AccessToken);

    private HttpClient Client()
    {
        var http = httpFactory.CreateClient();
        http.BaseAddress = new Uri(ApiBase);
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", AccessToken);
        return http;
    }

    public async Task<GatewayPreference> CreatePreferenceAsync(
        Guid intentId, string title, decimal amount, string payerEmail, CancellationToken ct = default)
    {
        if (!IsConfigured) throw new InvalidOperationException("Mercado Pago no está configurado.");

        var backUrl = config["MercadoPago:BackUrl"]?.TrimEnd('/') ?? "http://localhost:3000";

        var body = new
        {
            items = new[]
            {
                new { title, quantity = 1, unit_price = amount, currency_id = "UYU" }
            },
            payer = new { email = payerEmail },
            // Ancla que nos devuelve el webhook para saber a qué intento corresponde.
            external_reference = intentId.ToString(),
            back_urls = new
            {
                success = $"{backUrl}/me?compra=ok",
                pending = $"{backUrl}/me?compra=pendiente",
                failure = $"{backUrl}/me?compra=error"
            },
            auto_return = "approved",
            notification_url = config["MercadoPago:NotificationUrl"]
        };

        using var http = Client();
        var res = await http.PostAsJsonAsync("/checkout/preferences", body, ct);
        if (!res.IsSuccessStatusCode)
        {
            var detalle = await res.Content.ReadAsStringAsync(ct);
            log.LogError("Mercado Pago rechazó la preferencia ({Status}): {Detalle}", res.StatusCode, detalle);
            throw new InvalidOperationException("No se pudo iniciar el pago con Mercado Pago.");
        }

        var pref = await res.Content.ReadFromJsonAsync<PreferenceResponse>(cancellationToken: ct)
            ?? throw new InvalidOperationException("Respuesta inesperada de Mercado Pago.");

        return new GatewayPreference(pref.Id, pref.InitPoint);
    }

    public async Task<GatewayPayment?> GetPaymentAsync(string externalPaymentId, CancellationToken ct = default)
    {
        if (!IsConfigured) return null;

        using var http = Client();
        var res = await http.GetAsync($"/v1/payments/{externalPaymentId}", ct);
        if (!res.IsSuccessStatusCode)
        {
            log.LogWarning("No se pudo consultar el pago {Id} en Mercado Pago ({Status}).",
                externalPaymentId, res.StatusCode);
            return null;
        }

        var p = await res.Content.ReadFromJsonAsync<PaymentResponse>(cancellationToken: ct);
        if (p is null) return null;

        return new GatewayPayment(
            p.Id.ToString(), p.Status ?? "unknown", p.TransactionAmount, p.ExternalReference, p.StatusDetail);
    }

    private sealed record PreferenceResponse(
        [property: JsonPropertyName("id")] string Id,
        [property: JsonPropertyName("init_point")] string InitPoint);

    private sealed record PaymentResponse(
        [property: JsonPropertyName("id")] long Id,
        [property: JsonPropertyName("status")] string? Status,
        [property: JsonPropertyName("status_detail")] string? StatusDetail,
        [property: JsonPropertyName("transaction_amount")] decimal TransactionAmount,
        [property: JsonPropertyName("external_reference")] string? ExternalReference);
}
