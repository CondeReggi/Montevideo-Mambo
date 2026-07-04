namespace Mambo.Application.Abstractions;

/// <summary>
/// Fecha/hora en la zona de la academia: America/Montevideo = UTC-3 (sin DST).
/// "Hoy" para el negocio (sesiones del día, vencimientos, pagos) SIEMPRE es la fecha
/// LOCAL, no la UTC: si no, entre las 21:00 y medianoche de Montevideo la fecha UTC
/// ya es el día siguiente y no coinciden las sesiones del día.
/// </summary>
public static class ClockExtensions
{
    private static readonly TimeSpan MontevideoOffset = TimeSpan.FromHours(-3);

    public static DateTime LocalNow(this IClock clock) => clock.UtcNow + MontevideoOffset;

    public static DateOnly LocalToday(this IClock clock) => DateOnly.FromDateTime(clock.LocalNow());
}
