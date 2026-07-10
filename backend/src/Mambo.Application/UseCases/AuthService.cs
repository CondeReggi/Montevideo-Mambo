using System.Security.Cryptography;
using System.Text;
using Mambo.Application.Abstractions;
using Mambo.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Mambo.Application.UseCases;

public record LoginResult(string Token, DateTime ExpiresAt, string RefreshToken, DateTime RefreshExpiresAt,
                          Guid UserId, string FullName, string Email, string[] Roles, Guid? StudentId, Guid? TeacherId);

/// <summary>Nuevo par de tokens tras renovar (el refresh anterior queda revocado).</summary>
public record RefreshResult(string Token, DateTime ExpiresAt, string RefreshToken, DateTime RefreshExpiresAt);

/// <summary>Vida del refresh token (días). Se resuelve en el arranque (ver Program.cs).</summary>
public record RefreshTokenOptions(int Days);

/// <summary>Autenticación propia: login por email + contraseña y renovación por refresh token.</summary>
public class AuthService(
    IMamboDbContext db,
    IPasswordHasher hasher,
    IJwtIssuer jwt,
    IClock clock,
    RefreshTokenOptions refreshOptions)
{
    public async Task<LoginResult> LoginAsync(string email, string password, CancellationToken ct = default)
    {
        var user = await db.Users
            .Include(u => u.UserRoles).ThenInclude(ur => ur.Role)
            .FirstOrDefaultAsync(u => u.Email == email.ToLower() && u.IsActive, ct)
            ?? throw new InvalidOperationException("Credenciales inválidas.");

        if (string.IsNullOrEmpty(user.PasswordHash) || !hasher.Verify(user.PasswordHash, password))
            throw new InvalidOperationException("Credenciales inválidas.");

        var roles = user.UserRoles.Select(ur => ur.Role.Code.ToString().ToLower()).ToArray();
        var access = jwt.Issue(user, roles);
        var (refreshRaw, refreshExpires, _) = AddRefreshToken(user.Id);
        await db.SaveChangesAsync(ct);

        var studentId = await db.Students.Where(s => s.UserId == user.Id).Select(s => (Guid?)s.Id).FirstOrDefaultAsync(ct);
        var teacherId = await db.Teachers.Where(t => t.UserId == user.Id).Select(t => (Guid?)t.Id).FirstOrDefaultAsync(ct);

        return new LoginResult(access.Token, access.ExpiresAt, refreshRaw, refreshExpires,
            user.Id, user.FullName, user.Email, roles, studentId, teacherId);
    }

    /// <summary>
    /// Renueva la sesión a partir de un refresh token. Rota el token (revoca el usado y emite uno
    /// nuevo). Si llega un token YA revocado, se asume reuso/robo y se revoca toda la cadena del usuario.
    /// </summary>
    public async Task<RefreshResult> RefreshAsync(string refreshToken, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(refreshToken))
            throw new InvalidOperationException("Sesión inválida.");

        var hash = HashToken(refreshToken);
        var now = clock.UtcNow;

        var stored = await db.RefreshTokens
            .Include(rt => rt.User).ThenInclude(u => u.UserRoles).ThenInclude(ur => ur.Role)
            .FirstOrDefaultAsync(rt => rt.TokenHash == hash, ct)
            ?? throw new InvalidOperationException("Sesión inválida.");

        // Reuso de un token ya rotado → posible robo: cortar toda la cadena del usuario.
        if (stored.RevokedAt is not null)
        {
            await RevokeAllForUserAsync(stored.UserId, now, ct);
            await db.SaveChangesAsync(ct);
            throw new InvalidOperationException("Sesión inválida.");
        }
        if (stored.ExpiresAt <= now)
            throw new InvalidOperationException("Sesión expirada.");
        if (!stored.User.IsActive)
            throw new InvalidOperationException("Usuario inactivo.");

        // Rotación: emitir un nuevo par y revocar el actual enlazándolo con el reemplazo.
        var roles = stored.User.UserRoles.Select(ur => ur.Role.Code.ToString().ToLower()).ToArray();
        var access = jwt.Issue(stored.User, roles);
        var (refreshRaw, refreshExpires, newHash) = AddRefreshToken(stored.UserId);
        stored.RevokedAt = now;
        stored.ReplacedByTokenHash = newHash;
        await db.SaveChangesAsync(ct);

        return new RefreshResult(access.Token, access.ExpiresAt, refreshRaw, refreshExpires);
    }

    /// <summary>Cierra la sesión revocando el refresh token (idempotente).</summary>
    public async Task LogoutAsync(string refreshToken, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(refreshToken)) return;
        var hash = HashToken(refreshToken);
        var stored = await db.RefreshTokens
            .FirstOrDefaultAsync(rt => rt.TokenHash == hash && rt.RevokedAt == null, ct);
        if (stored is null) return;
        stored.RevokedAt = clock.UtcNow;
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Crea y agrega (sin guardar) un refresh token. Devuelve el valor EN CLARO, expiración y hash.</summary>
    private (string raw, DateTime expires, string hash) AddRefreshToken(Guid userId)
    {
        // 256 bits de entropía, en base64url para transportarlo cómodo.
        var raw = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
            .Replace('+', '-').Replace('/', '_').TrimEnd('=');
        var hash = HashToken(raw);
        var now = clock.UtcNow;
        var expires = now.AddDays(refreshOptions.Days);
        db.RefreshTokens.Add(new RefreshToken
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            TokenHash = hash,
            CreatedAt = now,
            ExpiresAt = expires,
        });
        return (raw, expires, hash);
    }

    private async Task RevokeAllForUserAsync(Guid userId, DateTime now, CancellationToken ct)
    {
        var active = await db.RefreshTokens.Where(rt => rt.UserId == userId && rt.RevokedAt == null).ToListAsync(ct);
        foreach (var t in active) t.RevokedAt = now;
    }

    private static string HashToken(string token) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))).ToLowerInvariant();
}
