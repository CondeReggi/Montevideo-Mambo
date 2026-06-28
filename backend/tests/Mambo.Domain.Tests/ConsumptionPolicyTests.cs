using Mambo.Domain;
using Mambo.Domain.Entities;
using Mambo.Domain.Rules;

namespace Mambo.Domain.Tests;

public class ConsumptionPolicyTests
{
    private static readonly DateOnly Today = new(2026, 6, 28);

    private static Pass MakePass(PassKind kind, int balance, int validFromOffset = -5, int validToOffset = +25,
                                 PassStatus status = PassStatus.Active) => new()
    {
        Id = Guid.NewGuid(),
        Kind = kind,
        Balance = balance,
        Status = status,
        ValidFrom = Today.AddDays(validFromOffset),
        ValidTo = Today.AddDays(validToOffset)
    };

    [Fact]
    public void Pase_libre_vigente_no_descuenta()
    {
        var passes = new[] { MakePass(PassKind.UnlimitedMonth, 0), MakePass(PassKind.ClassPack, 5) };
        var d = ConsumptionPolicy.Decide(passes, Today);
        Assert.Equal(CoverageKind.Unlimited, d.Kind);
        Assert.Null(d.Pass);
    }

    [Fact]
    public void Sin_pase_libre_consume_pack_FIFO_por_vencimiento_mas_proximo()
    {
        var lejano = MakePass(PassKind.ClassPack, 3, validToOffset: 25);
        var proximo = MakePass(PassKind.ClassPack, 3, validToOffset: 5);
        var d = ConsumptionPolicy.Decide(new[] { lejano, proximo }, Today);
        Assert.Equal(CoverageKind.Pass, d.Kind);
        Assert.Equal(proximo.Id, d.Pass!.Id); // vence antes -> se consume primero
    }

    [Fact]
    public void Pack_sin_saldo_cae_a_clase_suelta()
    {
        var packVacio = MakePass(PassKind.ClassPack, 0);
        var suelta = MakePass(PassKind.SingleClass, 1);
        var d = ConsumptionPolicy.Decide(new[] { packVacio, suelta }, Today);
        Assert.Equal(CoverageKind.Pass, d.Kind);
        Assert.Equal(suelta.Id, d.Pass!.Id);
    }

    [Fact]
    public void Sin_saldo_genera_deuda_sobre_pack_vigente()
    {
        var packVacio = MakePass(PassKind.ClassPack, 0);
        var d = ConsumptionPolicy.Decide(new[] { packVacio }, Today);
        Assert.Equal(CoverageKind.Debt, d.Kind);
        Assert.Equal(packVacio.Id, d.Pass!.Id);
    }

    [Fact]
    public void Sin_ninguna_cuponera_genera_deuda_sin_pass()
    {
        var d = ConsumptionPolicy.Decide(Array.Empty<Pass>(), Today);
        Assert.Equal(CoverageKind.Debt, d.Kind);
        Assert.Null(d.Pass);
    }

    [Fact]
    public void Pase_libre_vencido_no_cubre_cae_a_pack()
    {
        var vencido = MakePass(PassKind.UnlimitedMonth, 0, validFromOffset: -40, validToOffset: -10);
        var pack = MakePass(PassKind.ClassPack, 2);
        var d = ConsumptionPolicy.Decide(new[] { vencido, pack }, Today);
        Assert.Equal(CoverageKind.Pass, d.Kind);
        Assert.Equal(pack.Id, d.Pass!.Id);
    }
}
