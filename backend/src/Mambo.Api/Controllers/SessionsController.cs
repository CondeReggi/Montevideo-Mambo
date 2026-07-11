using Mambo.Application.Abstractions;
using Mambo.Application.UseCases;
using Mambo.Domain;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Mambo.Api.Controllers;

[ApiController]
[Route("api/sessions")]
[Authorize(Policy = "TeacherOrAdmin")]
public class SessionsController(
    IMamboDbContext db,
    StudentSummaryService summaries,
    AdminService admin,
    AlertsService alerts,
    IClock clock) : ControllerBase
{
    /// <summary>Genera (idempotente) las sesiones de hoy para las clases activas del día.</summary>
    [HttpPost("ensure-today")]
    public async Task<IActionResult> EnsureToday(CancellationToken ct) =>
        Ok(new { count = await admin.EnsureTodaySessionsAsync(ct) });

    /// <summary>Asistencias pendientes de clases ya finalizadas (recordatorio al profe).</summary>
    [HttpGet("pending-old")]
    public async Task<IActionResult> PendingOld(CancellationToken ct) =>
        Ok(await alerts.ListOldPendingAsync(ct));

    /// <summary>Sesiones de hoy con su conteo de pendientes (para que el profesor elija la clase).</summary>
    [HttpGet("today")]
    public async Task<IActionResult> Today(CancellationToken ct)
    {
        var today = clock.LocalToday();
        var sessions = await db.Sessions
            .Where(s => s.SessionDate == today)
            .OrderBy(s => s.StartAt)
            .Select(s => new
            {
                s.Id,
                s.Status,
                s.StartAt,
                s.EndAt,
                ClassName = s.Class.Name,
                s.Class.Style,
                s.Class.Level,
                PendingCount = s.Attendances.Count(a => a.Status == AttendanceStatus.Pending),
                ConfirmedCount = s.Attendances.Count(a => a.Status == AttendanceStatus.Confirmed)
            })
            .ToListAsync(ct);
        return Ok(sessions);
    }

    /// <summary>
    /// Asistencias de una sesión con verificación visual (foto + nombre + saldo) por alumno.
    /// Sirve para la lista que el profesor confirma.
    /// </summary>
    [HttpGet("{sessionId:guid}/attendances")]
    public async Task<IActionResult> Attendances(Guid sessionId, [FromQuery] bool onlyPending = true, CancellationToken ct = default)
    {
        var query = db.Attendances.Where(a => a.ClassSessionId == sessionId);
        if (onlyPending) query = query.Where(a => a.Status == AttendanceStatus.Pending);

        var rows = await query
            .OrderBy(a => a.CheckedInAt)
            .Select(a => new { a.Id, a.StudentId, a.Status, a.Source, a.CheckedInAt, a.IsAmbiguous })
            .ToListAsync(ct);

        // PERF-02: resúmenes de todos los alumnos en pocas queries (antes era 1 por fila = N+1).
        var summaryByStudent = await summaries.GetManyAsync(rows.Select(r => r.StudentId).ToList(), ct);

        var items = rows.Select(r => (object)new
        {
            r.Id, r.StudentId, status = r.Status.ToString(), source = r.Source.ToString(),
            r.CheckedInAt, r.IsAmbiguous,
            student = summaryByStudent.GetValueOrDefault(r.StudentId)
        }).ToList();
        return Ok(items);
    }
}
