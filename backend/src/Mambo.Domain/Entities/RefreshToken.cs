namespace Mambo.Domain.Entities;

/// <summary>
/// Refresh token opaco para renovar el access JWT sin volver a pedir contraseña.
/// Se guarda SOLO el hash (SHA-256); el valor en claro vive únicamente en el cliente.
/// Rotación: al usarse se revoca y se enlaza con el que lo reemplaza (detección de reuso).
/// </summary>
public class RefreshToken
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    /// <summary>SHA-256 (hex) del token opaco. Nunca se almacena el token en claro.</summary>
    public string TokenHash { get; set; } = default!;
    public DateTime ExpiresAt { get; set; }
    public DateTime CreatedAt { get; set; }
    /// <summary>Fecha de revocación (logout, rotación o reuso detectado). Null = vigente.</summary>
    public DateTime? RevokedAt { get; set; }
    /// <summary>Hash del token que reemplazó a éste al rotar (traza de la cadena).</summary>
    public string? ReplacedByTokenHash { get; set; }

    public AppUser User { get; set; } = default!;
}
