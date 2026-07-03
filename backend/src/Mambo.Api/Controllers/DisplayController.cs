using Mambo.Application.Abstractions;
using Mambo.Application.UseCases;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Mambo.Api.Controllers;

/// <summary>
/// Pantalla de la academia (Modo B): expone, por cada clase activa, su token ROTATIVO
/// para renderizar el QR dinámico que el alumno escanea. Sólo recepción/profe/admin.
/// </summary>
[ApiController]
[Route("api/display")]
[Authorize(Policy = "TeacherOrAdmin")]
public class DisplayController(IMamboDbContext db, SessionQrService qr, IClock clock) : ControllerBase
{
    [HttpGet("active")]
    public async Task<IActionResult> Active(CancellationToken ct)
    {
        var now = clock.UtcNow;
        // "Activa" = ahora dentro de [inicio, fin + 30min]. Se filtra por instante absoluto
        // (UTC), no por fecha de calendario, para evitar problemas de zona horaria.
        var floor = now.AddMinutes(-(int)Mambo.Domain.Rules.AttendanceWindow.ClosesAfterEnd.TotalMinutes);
        var sessions = await db.Sessions
            .Where(s => s.Status != "cancelled" && s.StartAt <= now && s.EndAt >= floor)
            .OrderBy(s => s.StartAt)
            .Select(s => new
            {
                s.Id, s.StartAt, s.EndAt,
                className = s.Class.Name, s.Class.Style, s.Class.Level
            })
            .ToListAsync(ct);

        var items = sessions
            .Select(s => new
            {
                s.Id, s.className, s.Style, s.Level, s.StartAt, s.EndAt,
                token = qr.CurrentToken(s.Id)
            })
            .ToList();

        return Ok(new { rotateInSeconds = qr.SecondsToNextRotation(), sessions = items });
    }
}
