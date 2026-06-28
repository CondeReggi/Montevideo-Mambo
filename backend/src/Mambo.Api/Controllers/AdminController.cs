using Mambo.Api.Auth;
using Mambo.Application.Abstractions;
using Mambo.Application.UseCases;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Mambo.Api.Controllers;

[ApiController]
[Route("api/admin")]
[Authorize(Policy = "Admin")]
public class AdminController(AdminService admin, IMamboDbContext db, ICurrentUser me) : ControllerBase
{
    public record EnsureSessionRequest(Guid ClassId, DateOnly Date);

    // ---- Alumnos ----
    [HttpPost("students")]
    public async Task<IActionResult> CreateStudent([FromBody] CreateStudentInput input, CancellationToken ct)
    {
        try { return Ok(new { id = await admin.CreateStudentAsync(input, me.UserIdOrThrow(), ct) }); }
        catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
    }

    [HttpGet("students")]
    public async Task<IActionResult> ListStudents(CancellationToken ct) =>
        Ok(await db.Students.OrderBy(s => s.User.FullName)
            .Select(s => new { s.Id, s.User.FullName, s.User.Email, s.QrFixedCode, s.IsActive })
            .ToListAsync(ct));

    // ---- Profesores ----
    [HttpPost("teachers")]
    public async Task<IActionResult> CreateTeacher([FromBody] CreateTeacherInput input, CancellationToken ct)
    {
        try { return Ok(new { id = await admin.CreateTeacherAsync(input, me.UserIdOrThrow(), ct) }); }
        catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
    }

    [HttpGet("teachers")]
    public async Task<IActionResult> ListTeachers(CancellationToken ct) =>
        Ok(await db.Teachers.OrderBy(t => t.User.FullName)
            .Select(t => new { t.Id, t.User.FullName, t.User.Email, t.IsActive })
            .ToListAsync(ct));

    // ---- Clases ----
    [HttpPost("classes")]
    public async Task<IActionResult> CreateClass([FromBody] CreateClassInput input, CancellationToken ct)
    {
        try { return Ok(new { id = await admin.CreateClassAsync(input, me.UserIdOrThrow(), ct) }); }
        catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
        catch (DbUpdateException) { return BadRequest(new { error = "Conflicto de horario: ya existe una clase en ese día y rango." }); }
    }

    [HttpGet("classes")]
    public async Task<IActionResult> ListClasses(CancellationToken ct) =>
        Ok(await db.Classes.OrderBy(c => c.Weekday).ThenBy(c => c.StartTime)
            .Select(c => new
            {
                c.Id, c.Name, c.Style, c.Level, c.Weekday,
                StartTime = c.StartTime.ToString(), EndTime = c.EndTime.ToString(),
                Teachers = c.ClassTeachers.Select(ct2 => ct2.Teacher.User.FullName).ToList()
            })
            .ToListAsync(ct));

    [HttpPost("sessions/ensure")]
    public async Task<IActionResult> EnsureSession([FromBody] EnsureSessionRequest req, CancellationToken ct) =>
        Ok(new { id = await admin.EnsureSessionAsync(req.ClassId, req.Date, ct) });
}
