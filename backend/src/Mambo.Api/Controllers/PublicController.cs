using Mambo.Application.Abstractions;
using Mambo.Application.UseCases;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Mambo.Api.Controllers;

/// <summary>Endpoints públicos (sin autenticación) para páginas de difusión.</summary>
[ApiController]
[Route("api/public")]
public class PublicController(IMamboDbContext db, ContentService content) : ControllerBase
{
    /// <summary>Contenidos publicados (noticias, novedades, muestras, talleres, eventos).</summary>
    [HttpGet("content")]
    public async Task<IActionResult> Content([FromQuery] string? type, CancellationToken ct) =>
        Ok(await content.ListPublishedAsync(type, ct));

    /// <summary>Grilla de clases activas para la página pública de horarios.</summary>
    [HttpGet("schedule")]
    public async Task<IActionResult> Schedule(CancellationToken ct)
    {
        var classes = await db.Classes.Where(c => c.IsActive)
            .Select(c => new
            {
                c.Weekday,
                StartTime = c.StartTime.ToString(),
                EndTime = c.EndTime.ToString(),
                c.Name, c.Style, c.Level
            })
            .ToListAsync(ct);

        // Orden en memoria (evita ORDER BY sobre TimeOnly en algunos proveedores).
        var ordered = classes
            .OrderBy(c => c.Weekday).ThenBy(c => c.StartTime)
            .ToList();
        return Ok(ordered);
    }
}
