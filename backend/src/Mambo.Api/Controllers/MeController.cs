using Mambo.Api.Auth;
using Mambo.Application.Abstractions;
using Mambo.Application.UseCases;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Mambo.Api.Controllers;

[ApiController]
[Route("api/me")]
[Authorize]
public class MeController(IMamboDbContext db, StudentPanelService panel, ICurrentUser me) : ControllerBase
{
    /// <summary>Panel del alumno autenticado: saldo, cuponeras, historial y pagos.</summary>
    [HttpGet("panel")]
    public async Task<IActionResult> Panel(CancellationToken ct)
    {
        var userId = me.UserIdOrThrow();
        var studentId = await db.Students.Where(s => s.UserId == userId)
            .Select(s => (Guid?)s.Id).FirstOrDefaultAsync(ct);
        if (studentId is null) return NotFound(new { error = "El usuario no es un alumno." });

        var result = await panel.GetAsync(studentId.Value, ct);
        return result is null ? NotFound() : Ok(result);
    }
}
