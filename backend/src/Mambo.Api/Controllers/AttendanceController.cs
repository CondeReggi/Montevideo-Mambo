using Mambo.Api.Auth;
using Mambo.Application.UseCases;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Mambo.Api.Controllers;

[ApiController]
[Route("api/attendance")]
[Authorize(Policy = "TeacherOrAdmin")]
public class AttendanceController(AttendanceConfirmationService svc, ICurrentUser me) : ControllerBase
{
    public record ConfirmManyRequest(List<Guid> AttendanceIds);
    public record ReasonRequest(string? Reason);

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
