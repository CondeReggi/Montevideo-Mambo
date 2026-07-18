using Mambo.Application.UseCases;
using Mambo.Domain;
using Mambo.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Mambo.Application.Tests;

/// <summary>
/// Tests de cuponeras y pagos. Regla dura: el PRECIO siempre sale del catálogo del
/// backend, nunca de lo que mande el cliente.
/// </summary>
public class BillingServiceTests
{
    private static BillingService Svc(TestDb h) => new(h.Db, h.Clock, h.Audit);

    private static async Task<PassType> TypeAsync(TestDb h, decimal price = 1200m,
        PassKind kind = PassKind.ClassPack, int? classCount = 8)
    {
        var type = new PassType
        {
            Id = Guid.NewGuid(),
            Name = "Pack 8 clases",
            Kind = kind,
            ClassCount = kind == PassKind.UnlimitedMonth ? null : classCount,
            Price = price,
            ValidityDays = 30,
            IsActive = true
        };
        h.Db.PassTypes.Add(type);
        await h.Db.SaveChangesAsync();
        return type;
    }

    [Fact]
    public async Task Asignar_cuponera_acredita_por_ledger_y_cobra_el_precio_del_CATALOGO()
    {
        await using var h = new TestDb();
        var student = await Make.StudentAsync(h);
        var type = await TypeAsync(h, price: 1200m);
        var actor = await Make.ActorAsync(h);

        var passId = await Svc(h).AssignPassAsync(
            new AssignPassInput(student.Id, type.Id, RegisterPayment: true, PaymentMethod: "efectivo"), actor.Id);

        // El crédito entra por el ledger (fuente de verdad), no por un contador.
        Assert.Equal(8, await Make.LedgerBalanceAsync(h, passId));

        // El importe cobrado es el del catálogo, no uno recibido de afuera.
        var pago = await h.Db.Payments.SingleAsync();
        Assert.Equal(1200m, pago.Amount);
        Assert.Equal(PaymentStatus.Confirmed, pago.Status);
        Assert.Equal(passId, pago.PassId);
    }

    [Fact]
    public async Task Asignar_sin_cobrar_deja_la_cuponera_IMPAGA_como_deuda()
    {
        await using var h = new TestDb();
        var student = await Make.StudentAsync(h);
        var type = await TypeAsync(h);
        var actor = await Make.ActorAsync(h);

        var passId = await Svc(h).AssignPassAsync(
            new AssignPassInput(student.Id, type.Id, RegisterPayment: false, PaymentMethod: null), actor.Id);

        var pass = await h.Db.Passes.FindAsync(passId);
        Assert.False(pass!.IsPaid);
        Assert.Equal(0, await h.Db.Payments.CountAsync());
    }

    [Fact]
    public async Task NO_se_puede_asignar_una_cuponera_duplicada_del_mismo_tipo_vigente()
    {
        // Decisión de negocio: una sola cuponera activa y vigente por tipo.
        await using var h = new TestDb();
        var student = await Make.StudentAsync(h);
        var type = await TypeAsync(h);
        var actor = await Make.ActorAsync(h);
        var input = new AssignPassInput(student.Id, type.Id, RegisterPayment: true, PaymentMethod: "efectivo");

        await Svc(h).AssignPassAsync(input, actor.Id);

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(
            () => Svc(h).AssignPassAsync(input, actor.Id));
        Assert.Contains("ya tiene una cuponera activa", ex.Message);

        Assert.Equal(1, await h.Db.Passes.CountAsync());
    }

    [Fact]
    public async Task Se_puede_asignar_una_cuponera_de_OTRO_tipo()
    {
        await using var h = new TestDb();
        var student = await Make.StudentAsync(h);
        var pack = await TypeAsync(h);
        var libre = await TypeAsync(h, price: 3000m, kind: PassKind.UnlimitedMonth, classCount: null);
        var actor = await Make.ActorAsync(h);

        await Svc(h).AssignPassAsync(new AssignPassInput(student.Id, pack.Id, true, "efectivo"), actor.Id);
        await Svc(h).AssignPassAsync(new AssignPassInput(student.Id, libre.Id, true, "efectivo"), actor.Id);

        Assert.Equal(2, await h.Db.Passes.CountAsync());
    }

    [Fact]
    public async Task Se_puede_volver_a_asignar_el_mismo_tipo_si_la_anterior_VENCIO()
    {
        await using var h = new TestDb();
        var student = await Make.StudentAsync(h);
        var type = await TypeAsync(h);
        var actor = await Make.ActorAsync(h);

        // Una vencida ayer no bloquea: el alumno tiene que poder renovar.
        var vencida = await Make.PassAsync(h, student.Id, balance: 0, validToOffsetDays: -1);
        vencida.PassTypeId = type.Id;
        await h.Db.SaveChangesAsync();

        var passId = await Svc(h).AssignPassAsync(
            new AssignPassInput(student.Id, type.Id, true, "efectivo"), actor.Id);

        Assert.NotEqual(Guid.Empty, passId);
    }

    [Fact]
    public async Task No_se_puede_asignar_una_cuponera_a_un_alumno_dado_de_baja()
    {
        await using var h = new TestDb();
        var student = await Make.StudentAsync(h, "STU-BAJA-010", active: false);
        var type = await TypeAsync(h);
        var actor = await Make.ActorAsync(h);

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => Svc(h).AssignPassAsync(new AssignPassInput(student.Id, type.Id, true, "efectivo"), actor.Id));
    }

    // ---- Cobro de una cuponera impaga ----

    [Fact]
    public async Task Cobrar_una_impaga_registra_el_precio_del_catalogo_y_la_marca_paga()
    {
        await using var h = new TestDb();
        var student = await Make.StudentAsync(h);
        var type = await TypeAsync(h, price: 1500m);
        var actor = await Make.ActorAsync(h);
        var passId = await Svc(h).AssignPassAsync(
            new AssignPassInput(student.Id, type.Id, RegisterPayment: false, PaymentMethod: null), actor.Id);

        await Svc(h).PayPassAsync(passId, "transferencia", actor.Id);

        var pass = await h.Db.Passes.FindAsync(passId);
        Assert.True(pass!.IsPaid);
        var pago = await h.Db.Payments.SingleAsync();
        Assert.Equal(1500m, pago.Amount);   // precio del catálogo, no del cliente
    }

    [Fact]
    public async Task No_se_puede_cobrar_dos_veces_la_misma_cuponera()
    {
        await using var h = new TestDb();
        var student = await Make.StudentAsync(h);
        var type = await TypeAsync(h);
        var actor = await Make.ActorAsync(h);
        var passId = await Svc(h).AssignPassAsync(
            new AssignPassInput(student.Id, type.Id, false, null), actor.Id);

        await Svc(h).PayPassAsync(passId, "efectivo", actor.Id);

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => Svc(h).PayPassAsync(passId, "efectivo", actor.Id));
        Assert.Equal(1, await h.Db.Payments.CountAsync());
    }

    // ---- Confirmación de pagos ----

    [Fact]
    public async Task Confirmar_un_pago_ligado_a_una_cuponera_la_marca_paga()
    {
        await using var h = new TestDb();
        var student = await Make.StudentAsync(h);
        var type = await TypeAsync(h);
        var actor = await Make.ActorAsync(h);
        var passId = await Svc(h).AssignPassAsync(new AssignPassInput(student.Id, type.Id, false, null), actor.Id);

        var pagoId = await Svc(h).RegisterPaymentAsync(
            new RegisterPaymentInput(student.Id, 1200m, "transferencia", "Pack", passId, Confirmed: false), actor.Id);

        await Svc(h).ConfirmPaymentAsync(pagoId, actor.Id);

        var pass = await h.Db.Passes.FindAsync(passId);
        Assert.True(pass!.IsPaid);
    }

    [Fact]
    public async Task No_se_puede_confirmar_dos_veces_el_mismo_pago()
    {
        await using var h = new TestDb();
        var student = await Make.StudentAsync(h);
        var actor = await Make.ActorAsync(h);
        var pagoId = await Svc(h).RegisterPaymentAsync(
            new RegisterPaymentInput(student.Id, 500m, "efectivo", "Seña", null, Confirmed: false), actor.Id);

        await Svc(h).ConfirmPaymentAsync(pagoId, actor.Id);

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => Svc(h).ConfirmPaymentAsync(pagoId, actor.Id));
    }

    [Fact]
    public async Task No_se_puede_cancelar_un_pago_ya_confirmado()
    {
        await using var h = new TestDb();
        var student = await Make.StudentAsync(h);
        var actor = await Make.ActorAsync(h);
        var pagoId = await Svc(h).RegisterPaymentAsync(
            new RegisterPaymentInput(student.Id, 500m, "efectivo", null, null, Confirmed: true), actor.Id);

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => Svc(h).CancelPaymentAsync(pagoId, actor.Id));
    }
}
