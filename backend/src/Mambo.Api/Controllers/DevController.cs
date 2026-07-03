using Mambo.Application.UseCases;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Mambo.Api.Controllers;

/// <summary>Utilidades de desarrollo. Disponible solo en entorno Development.</summary>
[ApiController]
[Route("api/dev")]
[AllowAnonymous]
public class DevController(DevSeeder seeder, IWebHostEnvironment env) : ControllerBase
{
    /// <summary>Crea datos demo (usuarios, clase, sesión, cuponeras, pendientes).</summary>
    [HttpPost("seed")]
    public async Task<IActionResult> Seed(CancellationToken ct)
    {
        if (!env.IsDevelopment())
            return NotFound();
        var message = await seeder.SeedAsync(ct);
        return Ok(new { message });
    }

    /// <summary>Carga la grilla real de clases 2026 (ver /Referencias/horarios.webp).</summary>
    [HttpPost("seed-horarios")]
    public async Task<IActionResult> SeedHorarios(CancellationToken ct)
    {
        if (!env.IsDevelopment())
            return NotFound();
        var message = await seeder.SeedHorarios2026Async(ct);
        return Ok(new { message });
    }
}
