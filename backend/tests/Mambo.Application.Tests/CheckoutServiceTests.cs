using Mambo.Application.Abstractions;
using Mambo.Application.UseCases;
using Mambo.Domain;
using Mambo.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Mambo.Application.Tests;

/// <summary>
/// Pasarela de mentira: permite simular lo que responde Mercado Pago sin salir a la red.
/// </summary>
public sealed class FakeGateway : IPaymentGateway
{
    public bool IsConfigured { get; set; } = true;
    public GatewayPayment? Payment { get; set; }
    public decimal? PrecioRecibido { get; private set; }
    public int PreferenciasCreadas { get; private set; }

    public Task<GatewayPreference> CreatePreferenceAsync(Guid intentId, string title, decimal amount,
        string payerEmail, CancellationToken ct = default)
    {
        PrecioRecibido = amount;
        PreferenciasCreadas++;
        return Task.FromResult(new GatewayPreference($"pref-{intentId}", $"https://mp.test/checkout/{intentId}"));
    }

    public Task<GatewayPayment?> GetPaymentAsync(string externalPaymentId, CancellationToken ct = default) =>
        Task.FromResult(Payment);
}

/// <summary>
/// Tests de la compra de cuponeras por pasarela. Lo crítico: el precio lo pone el
/// backend, no se puede pagar de menos, y un webhook repetido no entrega dos cuponeras.
/// </summary>
public class CheckoutServiceTests
{
    private static (CheckoutService Svc, FakeGateway Gw) Svc(TestDb h, bool configurado = true)
    {
        var gw = new FakeGateway { IsConfigured = configurado };
        var billing = new BillingService(h.Db, h.Clock, h.Audit);
        return (new CheckoutService(h.Db, h.Clock, h.Audit, gw, billing), gw);
    }

    private static async Task<PassType> TypeAsync(TestDb h, decimal price = 1200m)
    {
        var type = new PassType
        {
            Id = Guid.NewGuid(),
            Name = "Pack 8 clases",
            Kind = PassKind.ClassPack,
            ClassCount = 8,
            Price = price,
            ValidityDays = 30,
            IsActive = true
        };
        h.Db.PassTypes.Add(type);
        await h.Db.SaveChangesAsync();
        return type;
    }

    private static GatewayPayment MpPago(Guid intentId, string status, decimal amount, string id = "MP-1") =>
        new(id, status, amount, intentId.ToString(), null);

    // ---- Flag de configuración ----

    [Fact]
    public async Task Sin_credenciales_el_pago_online_esta_DESHABILITADO_y_no_rompe_nada()
    {
        await using var h = new TestDb();
        var (svc, _) = Svc(h, configurado: false);
        var student = await Make.StudentAsync(h);
        var type = await TypeAsync(h);

        Assert.False(svc.IsEnabled);
        await Assert.ThrowsAsync<InvalidOperationException>(() => svc.StartAsync(student.Id, type.Id));
    }

    [Fact]
    public async Task Sin_credenciales_un_webhook_no_hace_nada()
    {
        await using var h = new TestDb();
        var (svc, _) = Svc(h, configurado: false);
        Assert.False(await svc.HandleGatewayNotificationAsync("MP-1"));
    }

    // ---- Inicio del checkout ----

    [Fact]
    public async Task El_precio_lo_pone_el_BACKEND_desde_el_catalogo()
    {
        await using var h = new TestDb();
        var (svc, gw) = Svc(h);
        var student = await Make.StudentAsync(h);
        var type = await TypeAsync(h, price: 1750m);

        var res = await svc.StartAsync(student.Id, type.Id);

        // A la pasarela va el precio del catálogo; el alumno solo eligió el passTypeId.
        Assert.Equal(1750m, gw.PrecioRecibido);

        var intent = await h.Db.PaymentIntents.SingleAsync();
        Assert.Equal(1750m, intent.Amount);          // snapshot congelado
        Assert.Equal(PaymentIntentStatus.Pending, intent.Status);
        Assert.Contains(res.IntentId.ToString(), res.InitPoint);
    }

    [Fact]
    public async Task Iniciar_checkout_NO_entrega_la_cuponera_todavia()
    {
        await using var h = new TestDb();
        var (svc, _) = Svc(h);
        var student = await Make.StudentAsync(h);
        var type = await TypeAsync(h);

        await svc.StartAsync(student.Id, type.Id);

        Assert.Equal(0, await h.Db.Passes.CountAsync());
        Assert.Equal(0, await h.Db.Payments.CountAsync());
    }

    [Fact]
    public async Task No_se_puede_comprar_una_cuponera_que_ya_se_tiene_activa()
    {
        await using var h = new TestDb();
        var (svc, _) = Svc(h);
        var student = await Make.StudentAsync(h);
        var type = await TypeAsync(h);
        var actor = await Make.ActorAsync(h);
        await new BillingService(h.Db, h.Clock, h.Audit)
            .AssignPassAsync(new AssignPassInput(student.Id, type.Id, true, "efectivo"), actor.Id);

        // Mejor frenarlo antes de cobrarle que devolverle la plata después.
        await Assert.ThrowsAsync<InvalidOperationException>(() => svc.StartAsync(student.Id, type.Id));
    }

    [Fact]
    public async Task Un_alumno_dado_de_baja_no_puede_comprar()
    {
        await using var h = new TestDb();
        var (svc, _) = Svc(h);
        var student = await Make.StudentAsync(h, "STU-BAJA-020", active: false);
        var type = await TypeAsync(h);

        await Assert.ThrowsAsync<InvalidOperationException>(() => svc.StartAsync(student.Id, type.Id));
    }

    // ---- Webhook: pago aprobado ----

    [Fact]
    public async Task Pago_APROBADO_entrega_la_cuponera_con_credito_por_ledger_y_registra_el_pago()
    {
        await using var h = new TestDb();
        var (svc, gw) = Svc(h);
        var student = await Make.StudentAsync(h);
        var type = await TypeAsync(h, price: 1200m);
        var start = await svc.StartAsync(student.Id, type.Id);

        gw.Payment = MpPago(start.IntentId, "approved", 1200m);
        Assert.True(await svc.HandleGatewayNotificationAsync("MP-1"));

        // Desde un contexto NUEVO: ExecuteUpdate escribe en la BD sin tocar las
        // entidades ya trackeadas, así que releer por el mismo contexto daría la vieja.
        await using var fresh = h.NewContext();
        var intent = await fresh.PaymentIntents.SingleAsync();
        Assert.Equal(PaymentIntentStatus.Approved, intent.Status);
        Assert.NotNull(intent.PassId);
        Assert.Equal("MP-1", intent.ExternalPaymentId);

        var pass = await h.Db.Passes.SingleAsync();
        Assert.Equal(8, await Make.LedgerBalanceAsync(h, pass.Id));
        Assert.True(pass.IsPaid);

        var pago = await h.Db.Payments.SingleAsync();
        Assert.Equal(1200m, pago.Amount);
        Assert.Equal("mercadopago", pago.Method);
        Assert.Equal(PaymentStatus.Confirmed, pago.Status);
    }

    [Fact]
    public async Task WEBHOOK_REPETIDO_no_entrega_dos_cuponeras()
    {
        // Mercado Pago reintenta ante cualquier timeout: esto DEBE ser idempotente.
        await using var h = new TestDb();
        var (svc, gw) = Svc(h);
        var student = await Make.StudentAsync(h);
        var type = await TypeAsync(h);
        var start = await svc.StartAsync(student.Id, type.Id);
        gw.Payment = MpPago(start.IntentId, "approved", 1200m);

        await svc.HandleGatewayNotificationAsync("MP-1");
        await svc.HandleGatewayNotificationAsync("MP-1");
        await svc.HandleGatewayNotificationAsync("MP-1");

        Assert.Equal(1, await h.Db.Passes.CountAsync());
        Assert.Equal(1, await h.Db.Payments.CountAsync());
        var pass = await h.Db.Passes.SingleAsync();
        Assert.Equal(8, await Make.LedgerBalanceAsync(h, pass.Id)); // no 16 ni 24
    }

    // ---- Webhook: no confiar en el importe ----

    [Fact]
    public async Task NO_se_puede_pagar_MENOS_que_el_precio_real()
    {
        await using var h = new TestDb();
        var (svc, gw) = Svc(h);
        var student = await Make.StudentAsync(h);
        var type = await TypeAsync(h, price: 1200m);
        var start = await svc.StartAsync(student.Id, type.Id);

        // Aprobado en MP pero por menos plata de la que vale: NO se entrega.
        gw.Payment = MpPago(start.IntentId, "approved", 100m);
        Assert.False(await svc.HandleGatewayNotificationAsync("MP-1"));

        Assert.Equal(0, await h.Db.Passes.CountAsync());
        var intent = await h.Db.PaymentIntents.SingleAsync();
        Assert.Equal(PaymentIntentStatus.Rejected, intent.Status);
        Assert.Contains("Importe insuficiente", intent.FailureReason);
    }

    [Fact]
    public async Task Si_el_precio_del_catalogo_SUBE_despues_el_intento_respeta_el_suyo()
    {
        await using var h = new TestDb();
        var (svc, gw) = Svc(h);
        var student = await Make.StudentAsync(h);
        var type = await TypeAsync(h, price: 1200m);
        var start = await svc.StartAsync(student.Id, type.Id);

        // El admin sube el precio mientras el alumno estaba pagando.
        type.Price = 5000m;
        await h.Db.SaveChangesAsync();

        gw.Payment = MpPago(start.IntentId, "approved", 1200m);
        Assert.True(await svc.HandleGatewayNotificationAsync("MP-1"));

        // Pagó lo que le cotizamos: se le entrega igual.
        Assert.Equal(1, await h.Db.Passes.CountAsync());
    }

    // ---- Webhook: estados no aprobados ----

    [Theory]
    [InlineData("rejected", nameof(PaymentIntentStatus.Rejected))]
    [InlineData("cancelled", nameof(PaymentIntentStatus.Cancelled))]
    public async Task Pago_no_aprobado_no_entrega_cuponera(string mpStatus, string esperado)
    {
        await using var h = new TestDb();
        var (svc, gw) = Svc(h);
        var student = await Make.StudentAsync(h);
        var type = await TypeAsync(h);
        var start = await svc.StartAsync(student.Id, type.Id);

        gw.Payment = MpPago(start.IntentId, mpStatus, 1200m);
        Assert.False(await svc.HandleGatewayNotificationAsync("MP-1"));

        Assert.Equal(0, await h.Db.Passes.CountAsync());
        var intent = await h.Db.PaymentIntents.SingleAsync();
        Assert.Equal(esperado, intent.Status.ToString());
    }

    [Fact]
    public async Task Pago_PENDIENTE_deja_el_intento_en_curso_para_cuando_se_acredite()
    {
        await using var h = new TestDb();
        var (svc, gw) = Svc(h);
        var student = await Make.StudentAsync(h);
        var type = await TypeAsync(h);
        var start = await svc.StartAsync(student.Id, type.Id);

        gw.Payment = MpPago(start.IntentId, "pending", 1200m);
        Assert.False(await svc.HandleGatewayNotificationAsync("MP-1"));

        var intent = await h.Db.PaymentIntents.SingleAsync();
        Assert.Equal(PaymentIntentStatus.Pending, intent.Status);

        // Cuando MP lo acredita (ej. pago en efectivo), el mismo intento se aprueba.
        gw.Payment = MpPago(start.IntentId, "approved", 1200m);
        Assert.True(await svc.HandleGatewayNotificationAsync("MP-1"));
        Assert.Equal(1, await h.Db.Passes.CountAsync());
    }

    [Fact]
    public async Task Un_pago_rechazado_no_se_puede_aprobar_despues()
    {
        await using var h = new TestDb();
        var (svc, gw) = Svc(h);
        var student = await Make.StudentAsync(h);
        var type = await TypeAsync(h);
        var start = await svc.StartAsync(student.Id, type.Id);

        gw.Payment = MpPago(start.IntentId, "rejected", 1200m);
        await svc.HandleGatewayNotificationAsync("MP-1");

        // Un webhook tardío no debe resucitar un intento ya resuelto.
        gw.Payment = MpPago(start.IntentId, "approved", 1200m);
        await svc.HandleGatewayNotificationAsync("MP-1");

        Assert.Equal(0, await h.Db.Passes.CountAsync());
    }

    // ---- Webhook: ruido / pagos ajenos ----

    [Fact]
    public async Task Un_webhook_de_un_pago_que_no_es_nuestro_se_ignora()
    {
        await using var h = new TestDb();
        var (svc, gw) = Svc(h);
        gw.Payment = new GatewayPayment("MP-999", "approved", 9999m, "no-es-un-guid", null);

        Assert.False(await svc.HandleGatewayNotificationAsync("MP-999"));
        Assert.Equal(0, await h.Db.Passes.CountAsync());
    }

    [Fact]
    public async Task Un_webhook_de_un_intento_inexistente_se_ignora()
    {
        await using var h = new TestDb();
        var (svc, gw) = Svc(h);
        gw.Payment = MpPago(Guid.NewGuid(), "approved", 1200m);

        Assert.False(await svc.HandleGatewayNotificationAsync("MP-1"));
        Assert.Equal(0, await h.Db.Passes.CountAsync());
    }
}
