using Mambo.Application.Abstractions;
using Mambo.Domain;
using Mambo.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Mambo.Application.Tests;

/// <summary>
/// Tests del servicio de notificaciones push: suscripción idempotente por endpoint,
/// segmentación por rol, y limpieza de suscripciones vencidas (404/410).
/// </summary>
public class PushServiceTests
{
    private static PushDevice Dev(string ep) => new(ep, "p256-" + ep, "auth-" + ep);

    private static async Task<Guid> StudentUserAsync(TestDb h, string qr)
    {
        var student = await Make.StudentAsync(h, qr);
        // Rol de alumno (para la segmentación por rol).
        h.Db.Roles.Add(new Role { Id = (short)AppRole.Student, Code = AppRole.Student, Name = "Alumno" });
        h.Db.UserRoles.Add(new UserRole { UserId = student.UserId, RoleId = (short)AppRole.Student });
        await h.Db.SaveChangesAsync();
        return student.UserId;
    }

    [Fact]
    public async Task Suscribir_dos_veces_el_MISMO_endpoint_no_duplica()
    {
        await using var h = new TestDb();
        var user = await StudentUserAsync(h, "PUSH-1");

        await h.Push.SubscribeAsync(user, Dev("https://push.test/abc"), "Chrome", default);
        await h.Push.SubscribeAsync(user, Dev("https://push.test/abc"), "Chrome actualizado", default);

        Assert.Equal(1, await h.Db.PushSubscriptions.CountAsync());
        Assert.Equal("Chrome actualizado", (await h.Db.PushSubscriptions.SingleAsync()).UserAgent);
    }

    [Fact]
    public async Task Suscripcion_incompleta_se_rechaza()
    {
        await using var h = new TestDb();
        var user = await StudentUserAsync(h, "PUSH-2");
        await Assert.ThrowsAsync<InvalidOperationException>(
            () => h.Push.SubscribeAsync(user, new PushDevice("https://x", "", "auth"), null, default));
    }

    [Fact]
    public async Task Enviar_al_usuario_llega_a_todos_sus_dispositivos()
    {
        await using var h = new TestDb();
        var user = await StudentUserAsync(h, "PUSH-3");
        await h.Push.SubscribeAsync(user, Dev("https://push.test/movil"), "Móvil", default);
        await h.Push.SubscribeAsync(user, Dev("https://push.test/pc"), "PC", default);

        var sent = await h.Push.SendToUserAsync(user, new PushMessage("Hola", "cuerpo"), default);

        Assert.Equal(2, sent);
        Assert.Equal(2, h.PushSender.Sent.Count);
    }

    [Fact]
    public async Task Enviar_por_rol_llega_solo_a_los_alumnos()
    {
        await using var h = new TestDb();
        var alumno = await StudentUserAsync(h, "PUSH-4");
        var otro = await Make.ActorAsync(h); // sin rol de alumno
        await h.Push.SubscribeAsync(alumno, Dev("https://push.test/alumno"), null, default);
        await h.Push.SubscribeAsync(otro.Id, Dev("https://push.test/otro"), null, default);

        var sent = await h.Push.SendToRoleAsync(AppRole.Student, new PushMessage("Aviso", "clase"), default);

        Assert.Equal(1, sent);
        Assert.Equal("https://push.test/alumno", h.PushSender.Sent.Single().Endpoint);
    }

    [Fact]
    public async Task Una_suscripcion_vencida_se_borra_sola()
    {
        await using var h = new TestDb();
        var user = await StudentUserAsync(h, "PUSH-5");
        await h.Push.SubscribeAsync(user, Dev("https://push.test/viva"), null, default);
        await h.Push.SubscribeAsync(user, Dev("https://push.test/muerta"), null, default);
        h.PushSender.GoneEndpoints.Add("https://push.test/muerta"); // el navegador la rechaza

        var sent = await h.Push.SendToUserAsync(user, new PushMessage("t", "b"), default);

        Assert.Equal(1, sent); // solo la viva
        var quedan = await h.Db.PushSubscriptions.Select(s => s.Endpoint).ToListAsync();
        Assert.Equal(new[] { "https://push.test/viva" }, quedan); // la muerta se limpió
    }

    [Fact]
    public async Task Sin_configuracion_no_envia_nada()
    {
        await using var h = new TestDb();
        h.PushSender.IsConfigured = false;
        var user = await StudentUserAsync(h, "PUSH-6");
        await h.Db.PushSubscriptions.AddAsync(new PushSubscription
        {
            Id = Guid.NewGuid(), UserId = user, Endpoint = "https://push.test/x",
            P256dh = "p", Auth = "a", CreatedAt = h.Clock.UtcNow, LastUsedAt = h.Clock.UtcNow
        });
        await h.Db.SaveChangesAsync();

        var sent = await h.Push.SendToUserAsync(user, new PushMessage("t", "b"), default);
        Assert.Equal(0, sent);
    }

    [Fact]
    public async Task Desuscribir_borra_el_dispositivo()
    {
        await using var h = new TestDb();
        var user = await StudentUserAsync(h, "PUSH-7");
        await h.Push.SubscribeAsync(user, Dev("https://push.test/z"), null, default);

        await h.Push.UnsubscribeAsync("https://push.test/z", default);

        Assert.Equal(0, await h.Db.PushSubscriptions.CountAsync());
    }
}
