using Mambo.Domain.Entities;

namespace Mambo.Application.Abstractions;

public interface IPasswordHasher
{
    string Hash(string password);
    bool Verify(string hash, string password);
}

public record IssuedToken(string Token, DateTime ExpiresAt);

public interface IJwtIssuer
{
    IssuedToken Issue(AppUser user, IEnumerable<string> roles);
}
