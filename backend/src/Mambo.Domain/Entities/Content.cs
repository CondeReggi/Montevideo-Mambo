namespace Mambo.Domain.Entities;

/// <summary>
/// Contenido de difusión que administración publica y el alumno ve: noticias,
/// novedades, muestras, talleres y eventos. La ubicación es opcional (para talleres,
/// muestras y eventos); una noticia común no necesita ubicación.
/// </summary>
public class Content
{
    public Guid Id { get; set; }
    public ContentType Type { get; set; }
    public string Title { get; set; } = default!;
    public string? Body { get; set; }

    /// <summary>Ruta de la imagen en Supabase Storage (se sirve con signed URL). Opcional.</summary>
    public string? ImagePath { get; set; }

    /// <summary>Fecha del contenido (día del evento/taller, o fecha de publicación). Opcional.</summary>
    public DateOnly? EventDate { get; set; }

    /// <summary>Link externo opcional (inscripción, más info, red social).</summary>
    public string? ExternalUrl { get; set; }

    // ---- Ubicación opcional (alimenta el mapa: abrir en Google/Apple Maps) ----
    public string? LocationName { get; set; }   // ej. "MAMBO — Pablo de María 1474"
    public string? LocationAddress { get; set; }
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }

    /// <summary>Visible para los alumnos. Si es false, queda como borrador (solo lo ve admin).</summary>
    public bool IsPublished { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
