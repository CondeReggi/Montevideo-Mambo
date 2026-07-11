using System.Net.Http.Json;
using Mambo.Application.Abstractions;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;

namespace Mambo.Infrastructure.Services;

/// <summary>
/// Genera URLs firmadas de lectura usando la API de Storage de Supabase
/// (POST /storage/v1/object/sign/{bucket}/{path}). Requiere la service_role key.
/// Si falta configuración, devuelve null (la UI muestra un placeholder).
///
/// PERF-05: la URL firmada se cachea en memoria por ~la mitad del TTL, para no pegarle a
/// Supabase por cada foto en cada render (los listados repiten muchas fotos).
/// </summary>
public class SupabasePhotoStorage(IConfiguration config, IHttpClientFactory httpFactory, IMemoryCache cache) : IPhotoStorage
{
    private readonly string? _url = config["Supabase:Url"] ?? config["SUPABASE_URL"];
    private readonly string? _key = config["Supabase:ServiceRoleKey"] ?? config["SUPABASE_SERVICE_ROLE_KEY"];
    private readonly string _bucket = config["Supabase:StorageBucketPhotos"] ?? "student-photos";

    public async Task<string?> GetReadSignedUrlAsync(string? photoPath, int ttlSeconds = 300, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(photoPath) || string.IsNullOrEmpty(_url) || string.IsNullOrEmpty(_key))
            return null;

        var cacheKey = $"signedurl:{_bucket}:{photoPath}";
        if (cache.TryGetValue(cacheKey, out string? cached))
            return cached;

        var http = httpFactory.CreateClient();
        var endpoint = $"{_url}/storage/v1/object/sign/{_bucket}/{photoPath.TrimStart('/')}";

        using var req = new HttpRequestMessage(HttpMethod.Post, endpoint);
        req.Headers.Add("Authorization", $"Bearer {_key}");
        req.Headers.Add("apikey", _key);
        req.Content = JsonContent.Create(new { expiresIn = ttlSeconds });

        try
        {
            using var res = await http.SendAsync(req, ct);
            if (!res.IsSuccessStatusCode) return null;
            var body = await res.Content.ReadFromJsonAsync<SignResponse>(cancellationToken: ct);
            var signed = body?.signedURL is null ? null : $"{_url}/storage/v1{body.signedURL}";
            if (signed is not null)
                cache.Set(cacheKey, signed, TimeSpan.FromSeconds(ttlSeconds / 2.0));
            return signed;
        }
        catch
        {
            return null; // no romper el flujo por un fallo de Storage
        }
    }

    private record SignResponse(string? signedURL);
}
