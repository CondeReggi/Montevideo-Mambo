using System.Security.Cryptography;
using System.Text;
using Mambo.Application.Abstractions;

namespace Mambo.Application.UseCases;

/// <summary>Secreto para firmar los tokens rotativos del QR de clase (inyectado desde config).</summary>
public record QrTokenOptions(string Secret);

/// <summary>
/// Genera y valida el token ROTATIVO del QR dinámico por clase (Modo B: el alumno escanea
/// el QR de la academia). El token prueba PRESENCIA en vivo: rota cada 60s y sólo es válido
/// para el slot actual o el inmediatamente anterior (tolerancia). Una foto/captura vieja no sirve.
///
/// Formato: MB2.{sessionId:N}.{slot}.{sig}
///   slot = floor(unixSeconds / 60);  sig = HMAC-SHA256(secret, "{sessionId:N}:{slot}") (16 hex).
/// La firma prueba autenticidad (sólo el server con el secreto la puede crear); el slot prueba
/// frescura (se rechaza si es viejo). El QR NO se entrega a los alumnos: debe escanearse.
/// </summary>
public class SessionQrService(QrTokenOptions options, IClock clock)
{
    public const int SlotSeconds = 60;
    private const int GraceSlots = 1; // acepta el slot actual y el anterior (~2 min de vida)

    private static long SlotOf(DateTime utc) =>
        new DateTimeOffset(DateTime.SpecifyKind(utc, DateTimeKind.Utc)).ToUnixTimeSeconds() / SlotSeconds;

    private string Sign(Guid sessionId, long slot)
    {
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(options.Secret));
        var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes($"{sessionId:N}:{slot}"));
        return Convert.ToHexString(hash)[..16].ToLowerInvariant();
    }

    /// <summary>Token vigente para una sesión en este instante (para la pantalla de la academia).</summary>
    public string CurrentToken(Guid sessionId)
    {
        var slot = SlotOf(clock.UtcNow);
        return $"MB2.{sessionId:N}.{slot}.{Sign(sessionId, slot)}";
    }

    /// <summary>Segundos que faltan para la próxima rotación (para que el display refresque a tiempo).</summary>
    public int SecondsToNextRotation()
    {
        var unix = new DateTimeOffset(DateTime.SpecifyKind(clock.UtcNow, DateTimeKind.Utc)).ToUnixTimeSeconds();
        return (int)(SlotSeconds - (unix % SlotSeconds));
    }

    /// <summary>
    /// Valida un token escaneado y devuelve el sessionId si es auténtico y fresco.
    /// Devuelve null si el formato es inválido, la firma no coincide, o el slot está vencido.
    /// </summary>
    public Guid? ValidateToken(string? token)
    {
        if (string.IsNullOrWhiteSpace(token)) return null;
        var parts = token.Trim().Split('.');
        if (parts.Length != 4 || parts[0] != "MB2") return null;
        if (!Guid.TryParseExact(parts[1], "N", out var sessionId)) return null;
        if (!long.TryParse(parts[2], out var slot)) return null;

        var current = SlotOf(clock.UtcNow);
        // Sólo el slot actual o el anterior (tolerancia a la rotación / latencia de cámara).
        if (slot > current || slot < current - GraceSlots) return null;

        var expected = Sign(sessionId, slot);
        // Comparación en tiempo constante para no filtrar información por temporización.
        if (!CryptographicOperations.FixedTimeEquals(
                Encoding.UTF8.GetBytes(expected), Encoding.UTF8.GetBytes(parts[3].ToLowerInvariant())))
            return null;

        return sessionId;
    }
}
