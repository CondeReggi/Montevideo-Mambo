using Mambo.Application.UseCases;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Mambo.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController(AuthService auth) : ControllerBase
{
    public record LoginRequest(string Email, string Password);

    /// <summary>Login por email + contraseña. Devuelve un JWT y los roles del usuario.</summary>
    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<IActionResult> Login([FromBody] LoginRequest req, CancellationToken ct)
    {
        try { return Ok(await auth.LoginAsync(req.Email, req.Password, ct)); }
        catch (InvalidOperationException ex) { return Unauthorized(new { error = ex.Message }); }
    }
}
