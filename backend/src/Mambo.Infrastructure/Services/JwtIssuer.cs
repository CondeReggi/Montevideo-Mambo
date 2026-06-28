using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Mambo.Application.Abstractions;
using Mambo.Domain.Entities;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;

namespace Mambo.Infrastructure.Services;

/// <summary>Emite JWT propios (autenticación local). Compatible con la validación de Program.cs.</summary>
public class JwtIssuer(IConfiguration config) : IJwtIssuer
{
    public IssuedToken Issue(AppUser user, IEnumerable<string> roles)
    {
        var key = config["Jwt:Key"] ?? "dev-only-insecure-key-change-me-please-32+chars";
        var issuer = config["Jwt:Issuer"] ?? "mambo";
        var audience = config["Jwt:Audience"] ?? "mambo";
        var hours = int.TryParse(config["Jwt:ExpiresHours"], out var h) ? h : 12;

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
        var expires = DateTime.UtcNow.AddHours(hours);

        var token = new JwtSecurityToken(issuer, audience, claims, expires: expires, signingCredentials: creds);
        return new IssuedToken(new JwtSecurityTokenHandler().WriteToken(token), expires);
    }
}
