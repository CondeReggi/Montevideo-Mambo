namespace Mambo.Application.UseCases;

/// <summary>Aviso/recordatorio sobre el estado de una cuponera o del alumno.</summary>
public record AlertDto(string Level, string Message, Guid? PassId);

/// <summary>
/// Reglas de recordatorio de cuponeras (fuente única para alumno y admin).
/// El CRÍTICO (rojo) es sólo para PASE LIBRE y CUPONERAS (packs): vencida, vence en
/// ≤ 7 días, o queda 1 clase. La CLASE SUELTA nunca es crítica: sólo un aviso ámbar
/// "Tenés una clase suelta por usar". Sólo aplica a cuponeras activas.
/// </summary>
public static class PassAlerts
{
    public const int CriticalDays = 7;
    public const int WarnDays = 14;

    public static List<AlertDto> ForPass(Guid passId, string kind, int balance, DateOnly validTo, string status, DateOnly today)
    {
        var list = new List<AlertDto>();
        if (status != "Active") return list;

        var days = validTo.DayNumber - today.DayNumber;
        var isPack = kind == "ClassPack";
        var isUnlimited = kind == "UnlimitedMonth";
        var isSingle = kind == "SingleClass";

        // Clase suelta: nunca es crítico; sólo un recordatorio ámbar de que está sin usar.
        if (isSingle)
        {
            if (balance > 0 && days >= 0)
                list.Add(new("warn", "Tenés una clase suelta por usar", passId));
            return list;
        }

        // Vencimiento (sólo pase libre y packs con saldo)
        var relevant = isUnlimited || (isPack && balance > 0);
        if (relevant && days < 0)
            list.Add(new("critical", "Ya venció", passId));
        else if (relevant && days <= CriticalDays)
            list.Add(new("critical",
                days == 0 ? "Vence hoy" : days == 1 ? "Vence mañana" : $"Vence en {days} días", passId));
        else if (relevant && days <= WarnDays)
            list.Add(new("warn", $"Vence en {days} días", passId));

        // Clases restantes (sólo packs)
        if (isPack && days >= 0)
        {
            if (balance == 1) list.Add(new("critical", "Queda 1 clase", passId));
            else if (balance == 2) list.Add(new("warn", "Quedan 2 clases", passId));
        }

        return list;
    }
}
