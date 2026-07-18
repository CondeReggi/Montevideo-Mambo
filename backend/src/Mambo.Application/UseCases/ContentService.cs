using Mambo.Application.Abstractions;
using Mambo.Domain;
using Mambo.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Mambo.Application.UseCases;

public record ContentInput(
    string Type, string Title, string? Body, string? ImagePath, DateOnly? EventDate,
    string? ExternalUrl, string? LocationName, string? LocationAddress,
    double? Latitude, double? Longitude, bool IsPublished);

public record ContentDto(
    Guid Id, string Type, string Title, string? Body, string? ImageUrl, DateOnly? EventDate,
    string? ExternalUrl, string? LocationName, string? LocationAddress,
    double? Latitude, double? Longitude, bool IsPublished, DateTime CreatedAt);

/// <summary>
/// Gestión de contenidos de difusión (noticias, novedades, muestras, talleres, eventos).
/// Admin: alta/edición/baja y publicar/ocultar. Alumno/público: solo lo publicado.
/// </summary>
public class ContentService(IMamboDbContext db, IClock clock, IAuditService audit, IPhotoStorage photos, PushService push)
{
    // Aviso push a los alumnos cuando se publica algo (best-effort, nunca rompe la operación).
    private static readonly Dictionary<ContentType, string> PushHeading = new()
    {
        [ContentType.News] = "Nueva noticia",
        [ContentType.Update] = "Nueva novedad",
        [ContentType.Showcase] = "Nueva muestra",
        [ContentType.Workshop] = "Nuevo taller",
        [ContentType.Event] = "Nuevo evento",
    };

    private async Task NotifyPublishedAsync(Content c, CancellationToken ct)
    {
        var heading = PushHeading.TryGetValue(c.Type, out var h) ? h : "Novedad";
        await push.SendToRoleAsync(Domain.AppRole.Student,
            new PushMessage($"{heading}: {c.Title}", c.Body ?? "Tocá para ver más.", "/novedades", "content"), ct);
    }

    /// <summary>Listado para administración (incluye borradores).</summary>
    public async Task<List<ContentDto>> ListForAdminAsync(CancellationToken ct = default)
    {
        var rows = await db.Contents
            .OrderByDescending(c => c.EventDate ?? DateOnly.FromDateTime(c.CreatedAt))
            .ThenByDescending(c => c.CreatedAt)
            .ToListAsync(ct);
        return await MapAsync(rows, ct);
    }

    /// <summary>Listado público/alumno: SOLO lo publicado. Filtro opcional por tipo.</summary>
    public async Task<List<ContentDto>> ListPublishedAsync(string? type = null, CancellationToken ct = default)
    {
        var q = db.Contents.Where(c => c.IsPublished);
        if (!string.IsNullOrWhiteSpace(type) && Enum.TryParse<ContentType>(type, ignoreCase: true, out var t))
            q = q.Where(c => c.Type == t);

        var rows = await q
            .OrderByDescending(c => c.EventDate ?? DateOnly.FromDateTime(c.CreatedAt))
            .ThenByDescending(c => c.CreatedAt)
            .ToListAsync(ct);
        return await MapAsync(rows, ct);
    }

    public async Task<Guid> CreateAsync(ContentInput i, Guid actor, CancellationToken ct = default)
    {
        var now = clock.UtcNow;
        var content = new Content
        {
            Id = Guid.NewGuid(),
            Type = ParseType(i.Type),
            Title = Require(i.Title, "El título es obligatorio."),
            Body = i.Body,
            ImagePath = i.ImagePath,
            EventDate = i.EventDate,
            ExternalUrl = NullIfBlank(i.ExternalUrl),
            LocationName = NullIfBlank(i.LocationName),
            LocationAddress = NullIfBlank(i.LocationAddress),
            Latitude = i.Latitude,
            Longitude = i.Longitude,
            IsPublished = i.IsPublished,
            CreatedAt = now,
            UpdatedAt = now
        };
        db.Contents.Add(content);
        await db.SaveChangesAsync(ct);
        audit.Record(actor, "create_content", "content", content.Id, new { content.Type, content.Title });
        if (content.IsPublished) await NotifyPublishedAsync(content, ct);
        return content.Id;
    }

    public async Task UpdateAsync(Guid id, ContentInput i, Guid actor, CancellationToken ct = default)
    {
        var c = await db.Contents.FirstOrDefaultAsync(x => x.Id == id, ct)
            ?? throw new InvalidOperationException("Contenido no encontrado.");

        c.Type = ParseType(i.Type);
        c.Title = Require(i.Title, "El título es obligatorio.");
        c.Body = i.Body;
        // ImagePath solo se pisa si viene uno nuevo (null = "no tocar la imagen actual").
        if (i.ImagePath is not null) c.ImagePath = NullIfBlank(i.ImagePath);
        c.EventDate = i.EventDate;
        c.ExternalUrl = NullIfBlank(i.ExternalUrl);
        c.LocationName = NullIfBlank(i.LocationName);
        c.LocationAddress = NullIfBlank(i.LocationAddress);
        c.Latitude = i.Latitude;
        c.Longitude = i.Longitude;
        c.IsPublished = i.IsPublished;
        c.UpdatedAt = clock.UtcNow;

        await db.SaveChangesAsync(ct);
        audit.Record(actor, "update_content", "content", c.Id, new { c.Type, c.Title });
    }

    /// <summary>Publica u oculta (borrador) un contenido, sin borrarlo.</summary>
    public async Task SetPublishedAsync(Guid id, bool published, Guid actor, CancellationToken ct = default)
    {
        var c = await db.Contents.FirstOrDefaultAsync(x => x.Id == id, ct)
            ?? throw new InvalidOperationException("Contenido no encontrado.");
        var wasPublished = c.IsPublished;
        c.IsPublished = published;
        c.UpdatedAt = clock.UtcNow;
        await db.SaveChangesAsync(ct);
        audit.Record(actor, published ? "publish_content" : "hide_content", "content", c.Id);
        // Avisa solo al pasar de oculto a publicado (no re-avisa si ya estaba publicado).
        if (published && !wasPublished) await NotifyPublishedAsync(c, ct);
    }

    public async Task DeleteAsync(Guid id, Guid actor, CancellationToken ct = default)
    {
        var c = await db.Contents.FirstOrDefaultAsync(x => x.Id == id, ct)
            ?? throw new InvalidOperationException("Contenido no encontrado.");
        db.Contents.Remove(c);
        await db.SaveChangesAsync(ct);
        audit.Record(actor, "delete_content", "content", id);
    }

    private async Task<List<ContentDto>> MapAsync(List<Content> rows, CancellationToken ct)
    {
        // Imagen: si ya es una URL completa (flyer hosteado afuera), se usa tal cual;
        // si es una ruta de Supabase Storage, se firma. Así funciona la "imagen opcional"
        // sin depender todavía de la subida a Storage (pendiente aparte).
        var urls = await Task.WhenAll(rows.Select(c =>
            c.ImagePath is not null && (c.ImagePath.StartsWith("http://") || c.ImagePath.StartsWith("https://"))
                ? Task.FromResult<string?>(c.ImagePath)
                : photos.GetReadSignedUrlAsync(c.ImagePath, 300, ct)));

        return rows.Select((c, idx) => new ContentDto(
            c.Id, c.Type.ToString(), c.Title, c.Body, urls[idx], c.EventDate, c.ExternalUrl,
            c.LocationName, c.LocationAddress, c.Latitude, c.Longitude, c.IsPublished, c.CreatedAt)).ToList();
    }

    private static ContentType ParseType(string type) =>
        Enum.TryParse<ContentType>(type, ignoreCase: true, out var t)
            ? t
            : throw new InvalidOperationException($"Tipo de contenido inválido: {type}.");

    private static string Require(string? v, string msg) =>
        string.IsNullOrWhiteSpace(v) ? throw new InvalidOperationException(msg) : v.Trim();

    private static string? NullIfBlank(string? v) => string.IsNullOrWhiteSpace(v) ? null : v.Trim();
}
