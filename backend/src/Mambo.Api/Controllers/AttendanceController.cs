using Mambo.Api.Auth;
using Mambo.Application.Abstractions;
using Mambo.Application.UseCases;
using Mambo.Domain;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Mambo.Api.Controllers;

[ApiController]
[Route("api/attendance")]
[Authorize(Policy = "TeacherOrAdmin")]
public class AttendanceController(
    AttendanceConfirmationService svc,
    IMamboDbContext db,
    ICurrentUser me) : ControllerBase
{
    public record ConfirmManyRequest(List<Guid> AttendanceIds);
    public record ReasonRequest(string? Reason);

    /// <summary>Lista de asistencias pendientes de una sesión (la lista de la clase).</summary>
    [HttpGet("session/{sessionId:guid}/pending")]
    public async Task<IActionResult> Pending(Guid sessionId, CancellationToken ct)
    {
        var items = await db.Attendances
            .Where(a => a.ClassSessionId == sessionId && a.Status == AttendanceStatus.Pending)
            .Select(a => new
            {
                a.Id, a.StudentId, a.CheckedInAt, a.Source, a.IsAmbiguous,
                StudentName = a.Student.User.FullName, a.Student.PhotoPath
            })
            .ToListAsync(ct);
        return Ok(items);
    }

    /// <summary>Confirma una asistencia (descuenta cuponera según política).</summary>
    [HttpPost("{id:guid}/confirm")]
    public async Task<IActionResult> Confirm(Guid id, CancellationToken ct)
    {
        try { return Ok(await svc.ConfirmAsync(id, me.UserIdOrThrow(), ct)); }
        catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
    }

    /// <summary>Confirma toda una lista en una sola transacción.</summary>
    [HttpPost("confirm-many")]
    public async Task<IActionResult> ConfirmMany([FromBody] ConfirmManyRequest req, CancellationToken ct)
    {
        try { return Ok(await svc.ConfirmManyAsync(req.AttendanceIds, me.UserIdOrThrow(), ct)); }
        catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
    }

    /// <summary>Rechaza una asistencia pendiente.</summary>
    [HttpPost("{id:guid}/reject")]
    public async Task<IActionResult> Reject(Guid id, [FromBody] ReasonRequest req, CancellationToken ct)
    {
        try { await svc.RejectAsync(id, me.UserIdOrThrow(), req.Reason, ct); return NoContent(); }
        catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
    }

    /// <summary>Corrige una asistencia confirmada (motivo opcional; revierte el consumo).</summary>
    [HttpPost("{id:guid}/correct")]
    public async Task<IActionResult> Correct(Guid id, [FromBody] ReasonRequest req, CancellationToken ct)
    {
        try { await svc.CorrectAsync(id, me.UserIdOrThrow(), req.Reason, ct); return NoContent(); }
        catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
    }
}
