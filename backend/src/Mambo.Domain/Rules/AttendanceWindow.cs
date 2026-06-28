namespace Mambo.Domain.Rules;

/// <summary>
/// Ventana horaria de registro de asistencia: [fin - 15min, fin + 30min].
/// Toda comparación se hace en UTC (los EndAt de las sesiones se guardan en UTC).
/// </summary>
public static class AttendanceWindow
{
    public static readonly TimeSpan OpensBeforeEnd = TimeSpan.FromMinutes(15);
    public static readonly TimeSpan ClosesAfterEnd = TimeSpan.FromMinutes(30);

    public static DateTime OpenAt(DateTime sessionEndUtc) => sessionEndUtc - OpensBeforeEnd;
    public static DateTime CloseAt(DateTime sessionEndUtc) => sessionEndUtc + ClosesAfterEnd;

    /// <summary>¿El instante <paramref name="nowUtc"/> cae dentro de la ventana de la sesión? (inclusivo)</summary>
    public static bool IsWithin(DateTime sessionEndUtc, DateTime nowUtc) =>
        nowUtc >= OpenAt(sessionEndUtc) && nowUtc <= CloseAt(sessionEndUtc);
}
