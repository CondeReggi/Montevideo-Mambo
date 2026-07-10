using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Mambo.Application.Abstractions;
using Mambo.Domain.Entities;
using Microsoft.IdentityModel.Tokens;

namespace Mambo.Infrastructure.Services;

/// <summary>
/// Parámetros de firma/validación del JWT, ya resueltos en el arranque (fuente única de verdad).
/// La clave NO tiene fallback inseguro: si falta en producción, el arranque falla (ver Program.cs).
/// El access token es de corta vida (AccessMinutes); la sesión se prolonga con refresh tokens.
/// </summary>
public record JwtOptions(string Key, string Issuer, string Audience, int AccessMinutes, int RefreshDays);

/// <summary>Emite JWT propios (autenticación local). Compatible con la validación de Program.cs.</summary>
public class JwtIssuer(JwtOptions options) : IJwtIssuer
{
    public IssuedToken Issue(AppUser user, IEnumerable<string> roles)
    {
        var key = options.Key;
        var issuer = options.Issuer;
        var audience = options.Audience;

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new(JwtRegisteredClaimNames.Email, user.Email),
            new("name", user.FullName),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        };
        claims.AddRange(roles.Select(r => new Claim(ClaimTypes.Role, r)));

        var creds = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)), SecurityAlgorithms.HmacSha256);
        var expires = DateTime.UtcNow.AddMinutes(options.AccessMinutes);

        var token = new JwtSecurityToken(issuer, audience, claims, expires: expires, signingCredentials: creds);
        return new IssuedToken(new JwtSecurityTokenHandler().WriteToken(token), expires);
    }
}
