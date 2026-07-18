using Mambo.Api.Auth;
using Mambo.Application.UseCases;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Mambo.Api.Controllers;

/// <summary>Gestión de contenidos de difusión desde administración (CRUD + publicar/ocultar).</summary>
[ApiController]
[Route("api/admin/content")]
[Authorize(Policy = "Admin")]
public class AdminContentController(ContentService content, ICurrentUser me) : ControllerBase
{
    public record SetPublishedRequest(bool Published);

    /// <summary>Listado completo para administración (incluye borradores).</summary>
    [HttpGet]
    public async Task<IActionResult> List(CancellationToken ct) =>
        Ok(await content.ListForAdminAsync(ct));

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] ContentInput input, CancellationToken ct)
    {
        try { return Ok(new { id = await content.CreateAsync(input, me.UserIdOrThrow(), ct) }); }
        catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] ContentInput input, CancellationToken ct)
    {
        try { await content.UpdateAsync(id, input, me.UserIdOrThrow(), ct); return NoContent(); }
        catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
    }

    [HttpPost("{id:guid}/published")]
    public async Task<IActionResult> SetPublished(Guid id, [FromBody] SetPublishedRequest req, CancellationToken ct)
    {
        try { await content.SetPublishedAsync(id, req.Published, me.UserIdOrThrow(), ct); return NoContent(); }
        catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        try { await content.DeleteAsync(id, me.UserIdOrThrow(), ct); return NoContent(); }
        catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
    }
}
