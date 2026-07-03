using Mambo.Api.Auth;
using Mambo.Application.Abstractions;
using Mambo.Application.UseCases;
using Mambo.Domain;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Mambo.Api.Controllers;

[ApiController]
[Route("api/me")]
[Authorize]
public class MeController(
    IMamboDbContext db,
    StudentPanelService panel,
    CheckInService checkin,
    SessionQrService qr,
    IClock clock,
    ICurrentUser me) : ControllerBase
{
    public record ScanRequest(string Token);

    /// <summary>Panel del alumno autenticado: saldo, cuponeras, historial y pagos.</summary>
    [HttpGet("panel")]
    public async Task<IActionResult> Panel(CancellationToken ct)
    {
        var studentId = await MyStudentIdAsync(ct);
        if (studentId is null) return NotFound(new { error = "El usuario no es un alumno." });

        var result = await panel.GetAsync(studentId.Value, ct);
        return result is null ? NotFound() : Ok(result);
    }

    /// <summary>Mi código de QR fijo (Modo A: lo muestro y la recepción lo escanea).</summary>
    [HttpGet("qr")]
    public async Task<IActionResult> MyQr(CancellationToken ct)
    {
        var userId = me.UserIdOrThrow();
        var row = await db.Students.Where(s => s.UserId == userId)
            .Select(s => new { s.QrFixedCode, s.User.FullName }).FirstOrDefaultAsync(ct);
        return row is null ? NotFound(new { error = "El usuario no es un alumno." })
                           : Ok(new { qrFixedCode = row.QrFixedCode, fullName = row.FullName });
    }

    /// <summary>Clases que están corriendo ahora (para elegir y marcar). SIN token: hay que escanear.</summary>
    [HttpGet("active-classes")]
    public async Task<IActionResult> ActiveClasses(CancellationToken ct)
    {
        var now = clock.UtcNow;
        // "Activa" = ahora dentro de [inicio, fin + 30min], por instante absoluto (UTC).
        var floor = now.AddMinutes(-(int)Mambo.Domain.Rules.AttendanceWindow.ClosesAfterEnd.TotalMinutes);
        var active = await db.Sessions
            .Where(s => s.Status != "cancelled" && s.StartAt <= now && s.EndAt >= floor)
            .OrderBy(s => s.StartAt)
            .Select(s => new
            {
                s.Id, s.StartAt, s.EndAt,
                className = s.Class.Name, s.Class.Style, s.Class.Level
            })
            .ToListAsync(ct);
        return Ok(active);
    }

    /// <summary>Marca asistencia escaneando el QR dinámico de una clase (Modo B). Queda Pendiente.</summary>
    [HttpPost("scan")]
    public async Task<IActionResult> Scan([FromBody] ScanRequest req, CancellationToken ct)
    {
        var sessionId = qr.ValidateToken(req.Token);
        if (sessionId is null)
            return BadRequest(new { error = "Código inválido o vencido. Volvé a escanear el QR de la clase." });

        var studentId = await MyStudentIdAsync(ct);
        if (studentId is null) return NotFound(new { error = "El usuario no es un alumno." });

        try
        {
            var result = await checkin.RegisterForSessionAsync(studentId.Value, sessionId.Value,
                AttendanceSource.QrStudent, ct);
            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    private Task<Guid?> MyStudentIdAsync(CancellationToken ct) =>
        db.Students.Where(s => s.UserId == me.UserIdOrThrow())
            .Select(s => (Guid?)s.Id).FirstOrDefaultAsync(ct);
}
