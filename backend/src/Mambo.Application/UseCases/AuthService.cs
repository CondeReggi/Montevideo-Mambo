using Mambo.Application.Abstractions;
using Microsoft.EntityFrameworkCore;

namespace Mambo.Application.UseCases;

public record LoginResult(string Token, DateTime ExpiresAt, Guid UserId, string FullName,
                          string Email, string[] Roles, Guid? StudentId, Guid? TeacherId);

/// <summary>Autenticación propia (login por email + contraseña).</summary>
public class AuthService(IMamboDbContext db, IPasswordHasher hasher, IJwtIssuer jwt)
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
        var token = jwt.Issue(user, roles);

        var studentId = await db.Students.Where(s => s.UserId == user.Id).Select(s => (Guid?)s.Id).FirstOrDefaultAsync(ct);
        var teacherId = await db.Teachers.Where(t => t.UserId == user.Id).Select(t => (Guid?)t.Id).FirstOrDefaultAsync(ct);

        return new LoginResult(token.Token, token.ExpiresAt, user.Id, user.FullName,
            user.Email, roles, studentId, teacherId);
    }
}
