using Mambo.Application.UseCases;
using Mambo.Domain;
using Microsoft.EntityFrameworkCore;

namespace Mambo.Application.Tests;

/// <summary>
/// Tests del servicio que confirma/rechaza/corrige asistencias y aplica el consumo.
/// El saldo REAL siempre se afirma contra el LEDGER (fuente de verdad, D4), no contra
/// el caché pass.Balance.
/// </summary>
public class AttendanceConfirmationServiceTests
{
    private static AttendanceConfirmationService Svc(TestDb h) => new(h.Db, h.Clock, h.Audit);

    [Fact]
    public async Task Confirmar_descuenta_una_clase_y_deja_trazabilidad()
    {
        await using var h = new TestDb();
        var student = await Make.StudentAsync(h);
        var session = await Make.SessionAsync(h);
        var pass = await Make.PassAsync(h, student.Id, balance: 5);
        var att = await Make.AttendanceAsync(h, student.Id, session.Id);
        var actor = await Make.ActorAsync(h);

        var res = await Svc(h).ConfirmAsync(att.Id, actor.Id);

        Assert.Equal(AttendanceStatus.Confirmed, res.Status);
        Assert.Equal("pass", res.Coverage);
        Assert.False(res.GeneratedDebt);
        Assert.Equal(-1, await Make.LedgerBalanceAsync(h, pass.Id));

        // Trazabilidad: quién confirmó, cuándo, sobre qué cuponera.
        var saved = await h.Db.Attendances.FindAsync(att.Id);
        Assert.Equal(actor.Id, saved!.ConfirmedBy);
        Assert.Equal(h.Clock.UtcNow, saved.ConfirmedAt);
        Assert.Equal(pass.Id, saved.PassId);
        Assert.Contains(h.Audit.Records, r => r.Action == "confirm_attendance" && r.EntityId == att.Id);
    }

    [Fact]
    public async Task Confirmar_dos_veces_secuencialmente_NO_descuenta_dos_clases()
    {
        await using var h = new TestDb();
        var student = await Make.StudentAsync(h);
        var session = await Make.SessionAsync(h);
        var pass = await Make.PassAsync(h, student.Id, balance: 5);
        var att = await Make.AttendanceAsync(h, student.Id, session.Id);
        var actor = await Make.ActorAsync(h);

        await Svc(h).ConfirmAsync(att.Id, actor.Id);
        await Svc(h).ConfirmAsync(att.Id, actor.Id);

        Assert.Equal(-1, await Make.LedgerBalanceAsync(h, pass.Id));
    }

    [Fact]
    public async Task Dos_confirmaciones_CONCURRENTES_descuentan_UNA_sola_clase()
    {
        // Doble clic en "Confirmar": dos requests con contextos distintos, ambas leen
        // Pending y ambas pasan la guarda de estado. Solo una debe descontar.
        await using var h = new TestDb();
        var student = await Make.StudentAsync(h);
        var session = await Make.SessionAsync(h);
        var pass = await Make.PassAsync(h, student.Id, balance: 5);
        var att = await Make.AttendanceAsync(h, student.Id, session.Id);
        var actor = await Make.ActorAsync(h);

        // Contexto B: ya leyó la asistencia como Pending (antes de que A confirme).
        await using var ctxB = h.NewContext();
        var svcB = new AttendanceConfirmationService(ctxB, h.Clock, h.Audit);
        await ctxB.Attendances.Include(a => a.Session).FirstAsync(a => a.Id == att.Id);

        await Svc(h).ConfirmAsync(att.Id, actor.Id);   // A gana la carrera
        await svcB.ConfirmAsync(att.Id, actor.Id);     // B llega tarde: no debe descontar

        Assert.Equal(-1, await Make.LedgerBalanceAsync(h, pass.Id));
    }

    [Fact]
    public async Task Sin_saldo_se_confirma_igual_y_queda_deuda_nunca_se_bloquea()
    {
        // Regla núcleo R5: nunca se impide asistir por falta de saldo.
        await using var h = new TestDb();
        var student = await Make.StudentAsync(h);
        var session = await Make.SessionAsync(h);
        var att = await Make.AttendanceAsync(h, student.Id, session.Id);
        var actor = await Make.ActorAsync(h);

        var res = await Svc(h).ConfirmAsync(att.Id, actor.Id);

        Assert.Equal(AttendanceStatus.Confirmed, res.Status);
        Assert.True(res.GeneratedDebt);
        Assert.Equal("debt_uncovered", res.Coverage);
    }

    [Fact]
    public async Task Cuponera_vencida_no_cubre_y_genera_deuda()
    {
        await using var h = new TestDb();
        var student = await Make.StudentAsync(h);
        var session = await Make.SessionAsync(h);
        var vencida = await Make.PassAsync(h, student.Id, balance: 5, validToOffsetDays: -1);
        var att = await Make.AttendanceAsync(h, student.Id, session.Id);
        var actor = await Make.ActorAsync(h);

        var res = await Svc(h).ConfirmAsync(att.Id, actor.Id);

        Assert.True(res.GeneratedDebt);
        Assert.Equal(0, await Make.LedgerBalanceAsync(h, vencida.Id)); // no se tocó la vencida
    }

    [Fact]
    public async Task Pase_libre_confirma_sin_descontar()
    {
        await using var h = new TestDb();
        var student = await Make.StudentAsync(h);
        var session = await Make.SessionAsync(h);
        var libre = await Make.PassAsync(h, student.Id, balance: 0, kind: PassKind.UnlimitedMonth);
        var att = await Make.AttendanceAsync(h, student.Id, session.Id);
        var actor = await Make.ActorAsync(h);

        var res = await Svc(h).ConfirmAsync(att.Id, actor.Id);

        Assert.Equal("unlimited", res.Coverage);
        Assert.Equal(0, await Make.LedgerBalanceAsync(h, libre.Id));
        var saved = await h.Db.Attendances.FindAsync(att.Id);
        Assert.True(saved!.CoveredByUnlimited);
    }

    // ---- Corrección (R6: por compensación, nunca editando historia) ----

    [Fact]
    public async Task Corregir_una_confirmada_devuelve_exactamente_una_clase()
    {
        await using var h = new TestDb();
        var student = await Make.StudentAsync(h);
        var session = await Make.SessionAsync(h);
        var pass = await Make.PassAsync(h, student.Id, balance: 5);
        var att = await Make.AttendanceAsync(h, student.Id, session.Id);
        var actor = await Make.ActorAsync(h);

        await Svc(h).ConfirmAsync(att.Id, actor.Id);
        await Svc(h).CorrectAsync(att.Id, actor.Id, "se fue antes");

        Assert.Equal(0, await Make.LedgerBalanceAsync(h, pass.Id)); // -1 +1 = 0
        var saved = await h.Db.Attendances.FindAsync(att.Id);
        Assert.Equal(AttendanceStatus.Corrected, saved!.Status);
    }

    [Fact]
    public async Task Corregir_DOS_VECES_no_regala_clases()
    {
        // BUG CRÍTICO: CorrectAsync no tenía guarda de estado ni limpiaba PassId,
        // así que cada llamada acreditaba +1 al ledger, sin límite.
        await using var h = new TestDb();
        var student = await Make.StudentAsync(h);
        var session = await Make.SessionAsync(h);
        var pass = await Make.PassAsync(h, student.Id, balance: 5);
        var att = await Make.AttendanceAsync(h, student.Id, session.Id);
        var actor = await Make.ActorAsync(h);

        await Svc(h).ConfirmAsync(att.Id, actor.Id);
        await Svc(h).CorrectAsync(att.Id, actor.Id, "motivo");

        // Ya está corregida: reintentar debe rechazarse, no acreditar otro +1.
        await Assert.ThrowsAsync<InvalidOperationException>(
            () => Svc(h).CorrectAsync(att.Id, actor.Id, "otra vez"));
        await Assert.ThrowsAsync<InvalidOperationException>(
            () => Svc(h).CorrectAsync(att.Id, actor.Id, "y otra"));

        // El reverso compensa UNA sola vez, por más veces que se llame.
        Assert.Equal(0, await Make.LedgerBalanceAsync(h, pass.Id));
    }

    [Fact]
    public async Task Corregir_una_asistencia_nunca_confirmada_no_acredita_nada()
    {
        await using var h = new TestDb();
        var student = await Make.StudentAsync(h);
        var session = await Make.SessionAsync(h);
        var pass = await Make.PassAsync(h, student.Id, balance: 5);
        var att = await Make.AttendanceAsync(h, student.Id, session.Id);
        var actor = await Make.ActorAsync(h);

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => Svc(h).CorrectAsync(att.Id, actor.Id, "motivo"));

        Assert.Equal(0, await Make.LedgerBalanceAsync(h, pass.Id));
    }

    // ---- Rechazo ----

    [Fact]
    public async Task No_se_puede_rechazar_una_confirmada()
    {
        await using var h = new TestDb();
        var student = await Make.StudentAsync(h);
        var session = await Make.SessionAsync(h);
        await Make.PassAsync(h, student.Id, balance: 5);
        var att = await Make.AttendanceAsync(h, student.Id, session.Id);
        var actor = await Make.ActorAsync(h);

        await Svc(h).ConfirmAsync(att.Id, actor.Id);

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => Svc(h).RejectAsync(att.Id, actor.Id, "no vino"));
    }

    [Fact]
    public async Task Rechazar_dos_veces_no_pisa_el_motivo_original()
    {
        await using var h = new TestDb();
        var student = await Make.StudentAsync(h);
        var session = await Make.SessionAsync(h);
        var att = await Make.AttendanceAsync(h, student.Id, session.Id);
        var actor = await Make.ActorAsync(h);

        await Svc(h).RejectAsync(att.Id, actor.Id, "motivo original");
        // Segundo rechazo: idempotente (como ConfirmAsync), pero conserva el motivo original.
        await Svc(h).RejectAsync(att.Id, actor.Id, "motivo pisado");

        var saved = await h.Db.Attendances.FindAsync(att.Id);
        Assert.Equal("motivo original", saved!.CorrectionReason);
    }
}
