using Mambo.Application.UseCases;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Mambo.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController(AuthService auth) : ControllerBase
{
    public record LoginRequest(string Email, string Password);
    public record RefreshRequest(string RefreshToken);

    /// <summary>Login por email + contraseña. Devuelve access JWT + refresh token y los roles.</summary>
    [HttpPost("login")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]   // SEC-07: frena fuerza bruta (10 intentos/5 min por IP)
    public async Task<IActionResult> Login([FromBody] LoginRequest req, CancellationToken ct)
    {
        try { return Ok(await auth.LoginAsync(req.Email, req.Password, ct)); }
        catch (InvalidOperationException ex) { return Unauthorized(new { error = ex.Message }); }
    }

    /// <summary>Renueva la sesión: entrega un nuevo access JWT y rota el refresh token.</summary>
    [HttpPost("refresh")]
    [AllowAnonymous]
    public async Task<IActionResult> Refresh([FromBody] RefreshRequest req, CancellationToken ct)
    {
        try { return Ok(await auth.RefreshAsync(req.RefreshToken, ct)); }
        catch (InvalidOperationException ex) { return Unauthorized(new { error = ex.Message }); }
    }

    /// <summary>Cierra la sesión revocando el refresh token (idempotente).</summary>
    [HttpPost("logout")]
    [AllowAnonymous]
    public async Task<IActionResult> Logout([FromBody] RefreshRequest req, CancellationToken ct)
    {
        await auth.LogoutAsync(req.RefreshToken, ct);
        return NoContent();
    }
}
