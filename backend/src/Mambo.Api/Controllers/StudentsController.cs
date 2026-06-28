using Mambo.Application.UseCases;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Mambo.Api.Controllers;

[ApiController]
[Route("api/students")]
[Authorize(Policy = "TeacherOrAdmin")]
public class StudentsController(StudentSummaryService summaries) : ControllerBase
{
    /// <summary>Resumen del alumno: foto firmada, clases restantes, pase libre, deuda y pendientes.</summary>
    [HttpGet("{id:guid}/summary")]
    public async Task<IActionResult> Summary(Guid id, CancellationToken ct)
    {
        var s = await summaries.GetAsync(id, ct);
        return s is null ? NotFound() : Ok(s);
    }
}
