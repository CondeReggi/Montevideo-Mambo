namespace Mambo.Application.Abstractions;

/// <summary>Acceso a fotos de alumnos en Supabase Storage (bucket privado + URLs firmadas).</summary>
public interface IPhotoStorage
{
    /// <summary>
    /// Genera una URL firmada de lectura de corta vida para la ruta dada.
    /// Devuelve null si no hay foto o el Storage no está configurado.
    /// </summary>
    Task<string?> GetReadSignedUrlAsync(string? photoPath, int ttlSeconds = 300, CancellationToken ct = default);
}
