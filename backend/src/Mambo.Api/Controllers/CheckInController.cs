using Mambo.Application.UseCases;
using Mambo.Domain;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Mambo.Api.Controllers;

[ApiController]
[Route("api/checkin")]
public class CheckInController(CheckInService checkIn) : ControllerBase
{
    public record QrCheckInRequest(string QrCode);

    /// <summary>
    /// Modo primario: la academia escanea el QR fijo del alumno (recepción).
    /// Crea una asistencia pendiente. Requiere rol profesor o admin (operador en puerta).
    /// </summary>
    [HttpPost("qr")]
    [Authorize(Policy = "TeacherOrAdmin")]
    public async Task<IActionResult> ScanStudentQr([FromBody] QrCheckInRequest req, CancellationToken ct)
    {
        try
        {
            var result = await checkIn.RegisterByQrCodeAsync(req.QrCode, AttendanceSource.QrAcademy, ct);
            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }
}
