namespace Mambo.Domain.Entities;

/// <summary>Identidad de aplicación. Su Id coincide con auth.users.id de Supabase Auth.</summary>
public class AppUser
{
    public Guid Id { get; set; }
    public string Email { get; set; } = default!;
    public string FullName { get; set; } = default!;
    public string? Phone { get; set; }
    /// <summary>Hash de contraseña para autenticación propia (null si el usuario lo gestiona Supabase Auth).</summary>
    public string? PasswordHash { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public Student? Student { get; set; }
    public Teacher? Teacher { get; set; }
    public ICollection<UserRole> UserRoles { get; set; } = new List<UserRole>();
}

public class Role
{
    public short Id { get; set; }
    public AppRole Code { get; set; }
    public string Name { get; set; } = default!;
}

public class UserRole
{
    public Guid UserId { get; set; }
    public short RoleId { get; set; }
    public AppUser User { get; set; } = default!;
    public Role Role { get; set; } = default!;
}
