using Mambo.Application.UseCases;
using Mambo.Domain;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Mambo.Api.Controllers;

[ApiController]
[Route("api/checkin")]
public class CheckInController(CheckInService checkIn, StudentSummaryService summaries) : ControllerBase
{
    public record QrCheckInRequest(string QrCode);

    /// <summary>
    /// Modo primario: la academia escanea el QR fijo del alumno (recepción).
    /// Crea una asistencia pendiente y devuelve la verificación visual del alumno
    /// (foto + nombre + saldo) para que el operador confirme la identidad.
    /// </summary>
    [HttpPost("qr")]
    [Authorize(Policy = "TeacherOrAdmin")]
    public async Task<IActionResult> ScanStudentQr([FromBody] QrCheckInRequest req, CancellationToken ct)
    {
        try
        {
            var result = await checkIn.RegisterByQrCodeAsync(req.QrCode, AttendanceSource.QrAcademy, ct);
            var student = await summaries.GetAsync(result.StudentId, ct);
            return Ok(new { result, student });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }
}
