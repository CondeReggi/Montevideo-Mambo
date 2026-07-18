namespace Mambo.Application.Abstractions;

/// <summary>Preferencia creada en la pasarela: a dónde hay que mandar al alumno a pagar.</summary>
public record GatewayPreference(string PreferenceId, string InitPoint);

/// <summary>
/// Lo que la pasarela dice de un pago. Se consulta SIEMPRE contra su API:
/// el webhook solo trae el id, y su cuerpo no es confiable por sí solo.
/// </summary>
public record GatewayPayment(
    string ExternalPaymentId,
    string Status,          // approved | pending | rejected | cancelled | ...
    decimal Amount,
    string? ExternalReference,
    string? StatusDetail);

/// <summary>
/// Pasarela de pago (hoy Mercado Pago, Checkout Pro). La implementación vive en
/// Infrastructure; Application solo conoce este contrato.
/// </summary>
public interface IPaymentGateway
{
    /// <summary>
    /// false si faltan las credenciales. Con la pasarela sin configurar la app sigue
    /// funcionando normal y la UI muestra "próximamente" en vez de ofrecer el pago.
    /// </summary>
    bool IsConfigured { get; }

    /// <summary>Crea la preferencia de pago. El importe lo fija el backend, nunca el cliente.</summary>
    Task<GatewayPreference> CreatePreferenceAsync(
        Guid intentId, string title, decimal amount, string payerEmail, CancellationToken ct = default);

    /// <summary>Consulta un pago por su id en la pasarela (fuente de verdad del estado y del importe).</summary>
    Task<GatewayPayment?> GetPaymentAsync(string externalPaymentId, CancellationToken ct = default);
}
