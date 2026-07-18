using Mambo.Application.Abstractions;
using Mambo.Application.UseCases;

namespace Mambo.Application.Tests;

/// <summary>Almacenamiento de fotos de mentira: no sale a la red.</summary>
public sealed class FakePhotoStorage : IPhotoStorage
{
    public Task<string?> GetReadSignedUrlAsync(string? photoPath, int ttlSeconds = 300, CancellationToken ct = default) =>
        Task.FromResult(photoPath is null ? null : $"https://signed.test/{photoPath}");
}

/// <summary>Tests de la gestión de contenidos: borradores no se ven, filtros, validación.</summary>
public class ContentServiceTests
{
    private static ContentService Svc(TestDb h) => new(h.Db, h.Clock, h.Audit, new FakePhotoStorage(), h.Push);

    private static ContentInput Input(string type = "Event", string title = "Muestra de fin de año",
        bool published = true, string? image = null) =>
        new(type, title, "Cuerpo", image, new DateOnly(2026, 12, 1), null, null, null, null, null, published);

    [Fact]
    public async Task Crear_y_listar_para_admin_incluye_borradores()
    {
        await using var h = new TestDb();
        var actor = await Make.ActorAsync(h);
        await Svc(h).CreateAsync(Input(title: "Publicado", published: true), actor.Id);
        await Svc(h).CreateAsync(Input(title: "Borrador", published: false), actor.Id);

        var admin = await Svc(h).ListForAdminAsync();
        Assert.Equal(2, admin.Count);
    }

    [Fact]
    public async Task El_alumno_solo_ve_lo_PUBLICADO()
    {
        await using var h = new TestDb();
        var actor = await Make.ActorAsync(h);
        await Svc(h).CreateAsync(Input(title: "Publicado", published: true), actor.Id);
        await Svc(h).CreateAsync(Input(title: "Borrador", published: false), actor.Id);

        var publicos = await Svc(h).ListPublishedAsync();
        Assert.Single(publicos);
        Assert.Equal("Publicado", publicos[0].Title);
    }

    [Fact]
    public async Task Se_puede_filtrar_por_tipo()
    {
        await using var h = new TestDb();
        var actor = await Make.ActorAsync(h);
        await Svc(h).CreateAsync(Input(type: "News", title: "Una noticia"), actor.Id);
        await Svc(h).CreateAsync(Input(type: "Workshop", title: "Un taller"), actor.Id);

        var talleres = await Svc(h).ListPublishedAsync("Workshop");
        Assert.Single(talleres);
        Assert.Equal("Un taller", talleres[0].Title);
    }

    [Fact]
    public async Task Ocultar_saca_el_contenido_de_la_vista_del_alumno_sin_borrarlo()
    {
        await using var h = new TestDb();
        var actor = await Make.ActorAsync(h);
        var id = await Svc(h).CreateAsync(Input(published: true), actor.Id);

        await Svc(h).SetPublishedAsync(id, false, actor.Id);

        Assert.Empty(await Svc(h).ListPublishedAsync());
        Assert.Single(await Svc(h).ListForAdminAsync()); // sigue existiendo
    }

    [Fact]
    public async Task Editar_actualiza_los_campos()
    {
        await using var h = new TestDb();
        var actor = await Make.ActorAsync(h);
        var id = await Svc(h).CreateAsync(Input(title: "Título viejo"), actor.Id);

        await Svc(h).UpdateAsync(id, Input(title: "Título nuevo") with { }, actor.Id);

        var row = (await Svc(h).ListForAdminAsync()).Single();
        Assert.Equal("Título nuevo", row.Title);
    }

    [Fact]
    public async Task La_ubicacion_opcional_viaja_para_abrir_en_el_mapa()
    {
        await using var h = new TestDb();
        var actor = await Make.ActorAsync(h);
        var input = new ContentInput("Event", "Fiesta", "cuerpo", null, null, null,
            "MAMBO", "Pablo de María 1474", -34.9, -56.16, true);
        await Svc(h).CreateAsync(input, actor.Id);

        var row = (await Svc(h).ListPublishedAsync()).Single();
        Assert.Equal("Pablo de María 1474", row.LocationAddress);
        Assert.Equal(-34.9, row.Latitude);
    }

    [Fact]
    public async Task La_imagen_se_devuelve_como_signed_URL()
    {
        await using var h = new TestDb();
        var actor = await Make.ActorAsync(h);
        await Svc(h).CreateAsync(Input(image: "content/foto.jpg"), actor.Id);

        var row = (await Svc(h).ListPublishedAsync()).Single();
        Assert.Equal("https://signed.test/content/foto.jpg", row.ImageUrl);
    }

    [Fact]
    public async Task Un_tipo_invalido_se_rechaza()
    {
        await using var h = new TestDb();
        var actor = await Make.ActorAsync(h);
        await Assert.ThrowsAsync<InvalidOperationException>(
            () => Svc(h).CreateAsync(Input(type: "Cualquiera"), actor.Id));
    }

    [Fact]
    public async Task El_titulo_es_obligatorio()
    {
        await using var h = new TestDb();
        var actor = await Make.ActorAsync(h);
        await Assert.ThrowsAsync<InvalidOperationException>(
            () => Svc(h).CreateAsync(Input(title: "   "), actor.Id));
    }

    [Fact]
    public async Task Borrar_lo_elimina()
    {
        await using var h = new TestDb();
        var actor = await Make.ActorAsync(h);
        var id = await Svc(h).CreateAsync(Input(), actor.Id);

        await Svc(h).DeleteAsync(id, actor.Id);

        Assert.Empty(await Svc(h).ListForAdminAsync());
    }
}
