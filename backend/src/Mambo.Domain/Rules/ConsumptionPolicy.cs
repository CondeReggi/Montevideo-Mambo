using Mambo.Domain.Entities;

namespace Mambo.Domain.Rules;

/// <summary>Resultado de decidir cómo cubrir una asistencia confirmada.</summary>
public enum CoverageKind { Unlimited, Pass, Debt }

public readonly record struct CoverageDecision(CoverageKind Kind, Pass? Pass)
{
    public static CoverageDecision ByUnlimited() => new(CoverageKind.Unlimited, null);
    public static CoverageDecision ByPass(Pass pass) => new(CoverageKind.Pass, pass);
    public static CoverageDecision ByDebt(Pass? debtPass) => new(CoverageKind.Debt, debtPass);
}

/// <summary>
/// Política de consumo al confirmar una asistencia. Prioridad (regla R8):
///   1) Pase libre vigente  -> no descuenta nada.
///   2) Pack activo con saldo > 0 -> consume 1, FIFO por vencimiento más próximo.
///   3) Clase suelta pagada sin usar -> consume esa.
///   4) Nada -> se confirma igual y queda deuda (regla R5: nunca impedir asistir).
/// </summary>
public static class ConsumptionPolicy
{
    public static CoverageDecision Decide(IEnumerable<Pass> studentPasses, DateOnly onDate)
    {
        var passes = studentPasses.ToList();

        // 1) Pase libre vigente.
        var unlimited = passes
            .Where(p => p.Kind == PassKind.UnlimitedMonth && p.IsValidOn(onDate))
            .OrderBy(p => p.ValidTo)
            .FirstOrDefault();
        if (unlimited is not null)
            return CoverageDecision.ByUnlimited();

        // 2) Pack activo vigente con saldo, FIFO por vencimiento más próximo.
        var pack = passes
            .Where(p => p.Kind == PassKind.ClassPack && p.IsValidOn(onDate) && p.Balance > 0)
            .OrderBy(p => p.ValidTo)
            .FirstOrDefault();
        if (pack is not null)
            return CoverageDecision.ByPass(pack);

        // 3) Clase suelta pagada sin usar.
        var single = passes
            .Where(p => p.Kind == PassKind.SingleClass && p.IsValidOn(onDate) && p.Balance > 0)
            .OrderBy(p => p.ValidTo)
            .FirstOrDefault();
        if (single is not null)
            return CoverageDecision.ByPass(single);

        // 4) Sin saldo: se genera deuda sobre el pack vigente más reciente (si existe) o ninguno.
        var debtTarget = passes
            .Where(p => p.Kind != PassKind.UnlimitedMonth && p.IsValidOn(onDate))
            .OrderByDescending(p => p.ValidTo)
            .FirstOrDefault();
        return CoverageDecision.ByDebt(debtTarget);
    }
}
