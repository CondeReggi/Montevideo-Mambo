using Mambo.Application.UseCases;
using Mambo.Domain;
using Mambo.Domain.Rules;
using Microsoft.EntityFrameworkCore;

namespace Mambo.Application.Tests;

/// <summary>
/// Tests del check-in (Modo A: la academia escanea el QR del alumno; Modo B: el alumno
/// escanea el QR de la clase). El check-in NUNCA descuenta saldo: solo crea la pendiente.
/// </summary>
public class CheckInServiceTests
{
    private static CheckInService Svc(TestDb h) => new(h.Db, h.Clock);

    // ---- Modo A: recepción escanea el QR fijo del alumno ----

    [Fact]
    public async Task Escanear_QR_dentro_de_ventana_crea_pendiente_sin_descontar()
    {
        await using var h = new TestDb();
        var student = await Make.StudentAsync(h, "STU-ANA-001");
        await Make.SessionAsync(h); // termina justo ahora -> dentro de [fin-15, fin+30]
        var pass = await Make.PassAsync(h, student.Id, balance: 5);

        var res = await Svc(h).RegisterByQrCodeAsync("STU-ANA-001", AttendanceSource.QrAcademy);

        Assert.Equal(AttendanceStatus.Pending, res.Status);
        Assert.False(res.OutOfWindow);
        Assert.False(res.AlreadyExisted);
        // El descuento ocurre SOLO al confirmar (regla núcleo).
        Assert.Equal(0, await Make.LedgerBalanceAsync(h, pass.Id));
    }

    [Fact]
    public async Task Alumno_INACTIVO_no_puede_hacer_check_in()
    {
        await using var h = new TestDb();
        await Make.StudentAsync(h, "STU-BAJA-001", active: false);
        await Make.SessionAsync(h);

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => Svc(h).RegisterByQrCodeAsync("STU-BAJA-001", AttendanceSource.QrAcademy));
    }

    [Fact]
    public async Task Asistencia_manual_de_un_alumno_INACTIVO_se_rechaza()
    {
        // RegisterAsync es el que usa la asistencia manual del admin.
        await using var h = new TestDb();
        var student = await Make.StudentAsync(h, "STU-BAJA-002", active: false);
        await Make.SessionAsync(h);

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => Svc(h).RegisterAsync(student.Id, AttendanceSource.ManualAdmin));
    }

    [Fact]
    public async Task Asistencia_manual_de_un_alumno_INEXISTENTE_da_error_de_negocio_no_500()
    {
        await using var h = new TestDb();
        await Make.SessionAsync(h);

        // Antes reventaba por violación de FK (DbUpdateException -> HTTP 500).
        await Assert.ThrowsAsync<InvalidOperationException>(
            () => Svc(h).RegisterAsync(Guid.NewGuid(), AttendanceSource.ManualAdmin));
    }

    [Fact]
    public async Task Escanear_dos_veces_es_idempotente_no_duplica()
    {
        await using var h = new TestDb();
        await Make.StudentAsync(h, "STU-ANA-001");
        await Make.SessionAsync(h);

        var first = await Svc(h).RegisterByQrCodeAsync("STU-ANA-001", AttendanceSource.QrAcademy);
        var second = await Svc(h).RegisterByQrCodeAsync("STU-ANA-001", AttendanceSource.QrAcademy);

        Assert.False(first.AlreadyExisted);
        Assert.True(second.AlreadyExisted);
        Assert.Equal(first.AttendanceId, second.AttendanceId);
        Assert.Equal(1, await h.Db.Attendances.CountAsync());
    }

    [Fact]
    public async Task Fuera_de_ventana_no_se_descarta_queda_pendiente_para_revision()
    {
        // Regla núcleo: fuera de ventana NUNCA se descarta; queda pendiente manual.
        await using var h = new TestDb();
        await Make.StudentAsync(h, "STU-ANA-001");
        // La clase terminó hace 2 horas: fuera de [fin-15, fin+30].
        await Make.SessionAsync(h, endsAtUtc: h.Clock.UtcNow.AddHours(-2));

        var res = await Svc(h).RegisterByQrCodeAsync("STU-ANA-001", AttendanceSource.QrAcademy);

        Assert.True(res.OutOfWindow);
        Assert.Equal(AttendanceStatus.Pending, res.Status);
        var saved = await h.Db.Attendances.FirstAsync();
        Assert.Equal(AttendanceSource.OutOfWindowManual, saved.Source);
    }

    // ---- Reapertura tras rechazo (fix F5) ----

    [Fact]
    public async Task Reabrir_tras_rechazo_limpia_el_rastro_de_la_confirmacion_anterior()
    {
        await using var h = new TestDb();
        var student = await Make.StudentAsync(h, "STU-ANA-001");
        var session = await Make.SessionAsync(h);
        var pass = await Make.PassAsync(h, student.Id, balance: 5);
        var actor = await Make.ActorAsync(h);
        var confirmSvc = new AttendanceConfirmationService(h.Db, h.Clock, h.Audit);

        var att = await Make.AttendanceAsync(h, student.Id, session.Id);
        await confirmSvc.ConfirmAsync(att.Id, actor.Id);   // consume -1, setea PassId/ConfirmedBy
        await confirmSvc.CorrectAsync(att.Id, actor.Id, "error del profe"); // revierte +1

        // Vuelve a escanear: se REABRE la misma fila (hay unique alumno+sesión).
        var res = await Svc(h).RegisterByQrCodeAsync("STU-ANA-001", AttendanceSource.QrAcademy);

        Assert.Equal(AttendanceStatus.Pending, res.Status);
        Assert.False(res.AlreadyExisted);

        var reopened = await h.Db.Attendances.FindAsync(att.Id);
        // Nada de la confirmación anterior debe sobrevivir: sería auditoría falsa.
        Assert.Null(reopened!.PassId);
        Assert.Null(reopened.ConfirmedBy);
        Assert.Null(reopened.ConfirmedAt);
        Assert.False(reopened.CoveredByUnlimited);
        Assert.Equal(0, await Make.LedgerBalanceAsync(h, pass.Id));
    }

    [Fact]
    public async Task Reabrir_y_reconfirmar_descuenta_UNA_sola_clase()
    {
        await using var h = new TestDb();
        var student = await Make.StudentAsync(h, "STU-ANA-001");
        var session = await Make.SessionAsync(h);
        var pass = await Make.PassAsync(h, student.Id, balance: 5);
        var actor = await Make.ActorAsync(h);
        var confirmSvc = new AttendanceConfirmationService(h.Db, h.Clock, h.Audit);

        var att = await Make.AttendanceAsync(h, student.Id, session.Id);
        await confirmSvc.RejectAsync(att.Id, actor.Id, "no vino");
        await Svc(h).RegisterByQrCodeAsync("STU-ANA-001", AttendanceSource.QrAcademy); // reabre
        await confirmSvc.ConfirmAsync(att.Id, actor.Id);

        Assert.Equal(-1, await Make.LedgerBalanceAsync(h, pass.Id));
    }

    // ---- Modo B: el alumno escanea el QR rotativo de la clase ----

    [Fact]
    public async Task Modo_B_no_permite_marcar_en_una_clase_cancelada()
    {
        await using var h = new TestDb();
        var student = await Make.StudentAsync(h);
        var session = await Make.SessionAsync(h, status: "cancelled");

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => Svc(h).RegisterForSessionAsync(student.Id, session.Id, AttendanceSource.QrStudent));
    }

    [Fact]
    public async Task Modo_B_no_permite_marcar_una_clase_que_ya_termino_hace_rato()
    {
        await using var h = new TestDb();
        var student = await Make.StudentAsync(h);
        // Escaneable = [inicio, fin+30]. Esta terminó hace 2 h.
        var session = await Make.SessionAsync(h, endsAtUtc: h.Clock.UtcNow.AddHours(-2));

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => Svc(h).RegisterForSessionAsync(student.Id, session.Id, AttendanceSource.QrStudent));
    }

    [Fact]
    public async Task Modo_B_alumno_inactivo_no_puede_marcar()
    {
        await using var h = new TestDb();
        var student = await Make.StudentAsync(h, "STU-BAJA-003", active: false);
        var session = await Make.SessionAsync(h);

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => Svc(h).RegisterForSessionAsync(student.Id, session.Id, AttendanceSource.QrStudent));
    }

    [Fact]
    public async Task Modo_B_escanear_dos_veces_es_idempotente()
    {
        await using var h = new TestDb();
        var student = await Make.StudentAsync(h);
        var session = await Make.SessionAsync(h);

        var first = await Svc(h).RegisterForSessionAsync(student.Id, session.Id, AttendanceSource.QrStudent);
        var second = await Svc(h).RegisterForSessionAsync(student.Id, session.Id, AttendanceSource.QrStudent);

        Assert.False(first.AlreadyExisted);
        Assert.True(second.AlreadyExisted);
        Assert.Equal(1, await h.Db.Attendances.CountAsync());
    }

    // ---- Anti-duplicado a nivel BD (la garantía dura) ----

    [Fact]
    public async Task La_BD_impide_dos_asistencias_para_el_mismo_alumno_y_sesion()
    {
        // Garantía de integridad ante una carrera: el unique de BD es el que corta.
        await using var h = new TestDb();
        var student = await Make.StudentAsync(h);
        var session = await Make.SessionAsync(h);
        await Make.AttendanceAsync(h, student.Id, session.Id);

        await using var other = h.NewContext();
        other.Attendances.Add(new Domain.Entities.Attendance
        {
            Id = Guid.NewGuid(),
            StudentId = student.Id,
            ClassSessionId = session.Id,
            Status = AttendanceStatus.Pending,
            Source = AttendanceSource.QrStudent,
            CheckedInAt = h.Clock.UtcNow,
            CreatedAt = h.Clock.UtcNow,
            UpdatedAt = h.Clock.UtcNow
        });

        await Assert.ThrowsAsync<DbUpdateException>(() => other.SaveChangesAsync());
    }

    [Fact]
    public async Task Carrera_de_dos_check_ins_simultaneos_responde_idempotente_no_revienta()
    {
        // Dos requests leen "no existe" y ambos insertan; el unique corta al segundo.
        // Eso NO debe salir como error del servidor: debe responder "ya estaba registrada".
        await using var h = new TestDb();
        var student = await Make.StudentAsync(h);
        var session = await Make.SessionAsync(h);

        // La request "perdedora" ya construyó su fila (leyó "no existe" antes).
        var perdedora = new Domain.Entities.Attendance
        {
            Id = Guid.NewGuid(),
            StudentId = student.Id,
            ClassSessionId = session.Id,
            Status = AttendanceStatus.Pending,
            Source = AttendanceSource.QrStudent,
            CheckedInAt = h.Clock.UtcNow,
            CreatedAt = h.Clock.UtcNow,
            UpdatedAt = h.Clock.UtcNow
        };

        // Entre medio, la otra request gana e inserta la suya.
        var ganadora = await Make.AttendanceAsync(h, student.Id, session.Id);

        // Ahora la perdedora intenta guardar: choca contra el unique.
        h.Db.Attendances.Add(perdedora);
        var recuperada = await Svc(h).TryInsertAsync(perdedora, default);

        // Se recupera devolviendo la fila ganadora, en vez de propagar el error.
        Assert.NotNull(recuperada);
        Assert.Equal(ganadora.Id, recuperada!.Id);
        Assert.Equal(1, await h.NewContext().Attendances.CountAsync());
    }

    // ---- Ventana horaria ----

    [Fact]
    public async Task Las_ventanas_de_Modo_A_y_Modo_B_son_distintas_a_proposito()
    {
        // Documenta la divergencia real: al minuto 0 de la clase, Modo B deja marcar
        // ([inicio, fin+30]) pero Modo A la considera fuera de ventana ([fin-15, fin+30]).
        var end = new DateTime(2026, 7, 17, 23, 0, 0, DateTimeKind.Utc);
        var start = end.AddMinutes(-90);
        var alEmpezar = start;

        Assert.True(CheckInService.IsSessionScannable(start, end, alEmpezar));
        Assert.False(AttendanceWindow.IsWithin(end, alEmpezar));
        await Task.CompletedTask;
    }
}
