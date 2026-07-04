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
public class AdminController(
    AdminService admin,
    BillingService billing,
    StudentPanelService panels,
    AlertsService alerts,
    Mambo.Application.UseCases.CheckInService checkin,
    IMamboDbContext db,
    ICurrentUser me) : ControllerBase
{
    public record EnsureSessionRequest(Guid ClassId, DateOnly Date);
    public record ManualAttendanceRequest(Guid StudentId);
    public record SetActiveRequest(bool Active);

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
            .Select(s => new { s.Id, s.User.FullName, s.User.Email, s.User.Phone, s.QrFixedCode, s.IsActive })
            .ToListAsync(ct));

    [HttpPut("students/{id:guid}")]
    public async Task<IActionResult> UpdateStudent(Guid id, [FromBody] UpdateStudentInput input, CancellationToken ct)
    {
        try { await admin.UpdateStudentAsync(id, input, me.UserIdOrThrow(), ct); return NoContent(); }
        catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
    }

    [HttpPost("students/{id:guid}/active")]
    public async Task<IActionResult> SetStudentActive(Guid id, [FromBody] SetActiveRequest req, CancellationToken ct)
    {
        try { await admin.SetStudentActiveAsync(id, req.Active, me.UserIdOrThrow(), ct); return NoContent(); }
        catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
    }

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
            .Select(t => new { t.Id, t.User.FullName, t.User.Email, t.Bio, t.IsActive })
            .ToListAsync(ct));

    [HttpPut("teachers/{id:guid}")]
    public async Task<IActionResult> UpdateTeacher(Guid id, [FromBody] UpdateTeacherInput input, CancellationToken ct)
    {
        try { await admin.UpdateTeacherAsync(id, input, me.UserIdOrThrow(), ct); return NoContent(); }
        catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
    }

    [HttpPost("teachers/{id:guid}/active")]
    public async Task<IActionResult> SetTeacherActive(Guid id, [FromBody] SetActiveRequest req, CancellationToken ct)
    {
        try { await admin.SetTeacherActiveAsync(id, req.Active, me.UserIdOrThrow(), ct); return NoContent(); }
        catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
    }

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
                c.Id, c.Name, c.Style, c.Level, c.Weekday, c.Room, c.IsActive,
                StartTime = c.StartTime.ToString(), EndTime = c.EndTime.ToString(),
                Teachers = c.ClassTeachers.Select(ct2 => ct2.Teacher.User.FullName).ToList(),
                TeacherIds = c.ClassTeachers.Select(ct2 => ct2.TeacherId).ToList()
            })
            .ToListAsync(ct));

    [HttpPut("classes/{id:guid}")]
    public async Task<IActionResult> UpdateClass(Guid id, [FromBody] UpdateClassInput input, CancellationToken ct)
    {
        try { await admin.UpdateClassAsync(id, input, me.UserIdOrThrow(), ct); return NoContent(); }
        catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
        catch (DbUpdateException) { return BadRequest(new { error = "Conflicto de horario: ya existe una clase en ese día y rango." }); }
    }

    [HttpPost("classes/{id:guid}/active")]
    public async Task<IActionResult> SetClassActive(Guid id, [FromBody] SetActiveRequest req, CancellationToken ct)
    {
        try { await admin.SetClassActiveAsync(id, req.Active, me.UserIdOrThrow(), ct); return NoContent(); }
        catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
    }

    [HttpPost("sessions/ensure")]
    public async Task<IActionResult> EnsureSession([FromBody] EnsureSessionRequest req, CancellationToken ct) =>
        Ok(new { id = await admin.EnsureSessionAsync(req.ClassId, req.Date, ct) });

    // ---- Detalle del alumno (panel completo para gestión) ----
    [HttpGet("students/{id:guid}")]
    public async Task<IActionResult> StudentDetail(Guid id, CancellationToken ct)
    {
        var panel = await panels.GetAsync(id, ct);
        return panel is null ? NotFound(new { error = "Alumno no encontrado." }) : Ok(panel);
    }

    // ---- Cuponeras ----
    [HttpGet("passtypes")]
    public async Task<IActionResult> PassTypes(CancellationToken ct) => Ok(await billing.ListPassTypesAsync(ct));

    [HttpPost("passes")]
    public async Task<IActionResult> AssignPass([FromBody] AssignPassInput input, CancellationToken ct)
    {
        try { return Ok(new { id = await billing.AssignPassAsync(input, me.UserIdOrThrow(), ct) }); }
        catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
    }

    [HttpPost("passes/{id:guid}/extend")]
    public async Task<IActionResult> ExtendPass(Guid id, [FromBody] ExtendPassInput input, CancellationToken ct)
    {
        try { await billing.ExtendPassAsync(id, input, me.UserIdOrThrow(), ct); return NoContent(); }
        catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
    }

    public record PayPassRequest(string? Method);
    [HttpPost("passes/{id:guid}/pay")]
    public async Task<IActionResult> PayPass(Guid id, [FromBody] PayPassRequest? req, CancellationToken ct)
    {
        try { return Ok(new { id = await billing.PayPassAsync(id, req?.Method, me.UserIdOrThrow(), ct) }); }
        catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
    }

    // ---- Pagos ----
    [HttpPost("payments")]
    public async Task<IActionResult> RegisterPayment([FromBody] RegisterPaymentInput input, CancellationToken ct)
    {
        try { return Ok(new { id = await billing.RegisterPaymentAsync(input, me.UserIdOrThrow(), ct) }); }
        catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
    }

    [HttpGet("payments/pending")]
    public async Task<IActionResult> PendingPayments(CancellationToken ct) => Ok(await billing.ListPendingPaymentsAsync(ct));

    [HttpPost("payments/{id:guid}/confirm")]
    public async Task<IActionResult> ConfirmPayment(Guid id, CancellationToken ct)
    {
        try { await billing.ConfirmPaymentAsync(id, me.UserIdOrThrow(), ct); return NoContent(); }
        catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
    }

    [HttpPost("payments/{id:guid}/cancel")]
    public async Task<IActionResult> CancelPayment(Guid id, CancellationToken ct)
    {
        try { await billing.CancelPaymentAsync(id, me.UserIdOrThrow(), ct); return NoContent(); }
        catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
    }

    // ---- Morosos ----
    [HttpGet("debtors")]
    public async Task<IActionResult> Debtors(CancellationToken ct) => Ok(await billing.ListDebtorsAsync(ct));

    // ---- Recordatorios / avisos ----
    [HttpGet("alerts")]
    public async Task<IActionResult> Alerts(CancellationToken ct) => Ok(new
    {
        studentsAtRisk = await alerts.ListStudentsAtRiskAsync(ct),
        oldPending = await alerts.ListOldPendingAsync(ct),
    });

    // ---- Asistencia manual (sin QR; ej. registro tardío) ----
    [HttpPost("attendance/manual")]
    public async Task<IActionResult> ManualAttendance([FromBody] ManualAttendanceRequest req, CancellationToken ct)
    {
        try { return Ok(await checkin.RegisterAsync(req.StudentId, Mambo.Domain.AttendanceSource.ManualAdmin, ct)); }
        catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
    }
}
