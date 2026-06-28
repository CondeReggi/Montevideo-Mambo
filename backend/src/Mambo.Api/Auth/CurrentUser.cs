using System.Security.Claims;

namespace Mambo.Api.Auth;

/// <summary>Expone la identidad del usuario autenticado (a partir del claim 'sub' del JWT de Supabase).</summary>
public interface ICurrentUser
{
    Guid? UserId { get; }
    Guid UserIdOrThrow();
    bool IsInRole(string role);
}

public class CurrentUser(IHttpContextAccessor accessor) : ICurrentUser
{
    private ClaimsPrincipal? Principal => accessor.HttpContext?.User;

    public Guid? UserId
    {
        get
        {
            var sub = Principal?.FindFirstValue(ClaimTypes.NameIdentifier)
                      ?? Principal?.FindFirstValue("sub");
            return Guid.TryParse(sub, out var id) ? id : null;
        }
    }

    public Guid UserIdOrThrow() =>
        UserId ?? throw new UnauthorizedAccessException("No hay usuario autenticado.");

    public bool IsInRole(string role) => Principal?.IsInRole(role) ?? false;
}
