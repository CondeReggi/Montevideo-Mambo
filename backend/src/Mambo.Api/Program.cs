using System.Threading.RateLimiting;
using Mambo.Api.Auth;
using Mambo.Infrastructure;
using Mambo.Infrastructure.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

var isDevelopment = builder.Environment.IsDevelopment();

// Claves SOLO de desarrollo. Nunca se usan en producción: si en un entorno no-Development
// falta el secreto real, ResolveSecret lanza y el arranque se detiene (fail-fast, ver SEC-01/04).
// Deben ser DISTINTAS entre sí para no reutilizar un mismo secreto en dos dominios de confianza.
const string devJwtKey = "dev-only-jwt-signing-key-change-in-prod-0123456789";
const string devQrSecret = "dev-only-qr-hmac-secret-change-in-prod-abcdefghij";

// Lee un secreto de configuración. Si está presente exige longitud mínima (32 chars = 256 bits).
// Si falta: en Development usa el fallback de dev; en cualquier otro entorno, falla el arranque.
static string ResolveSecret(IConfiguration cfg, string key, bool isDev, string devFallback, string label)
{
    var value = cfg[key];
    if (!string.IsNullOrWhiteSpace(value))
        return value.Length >= 32
            ? value
            : throw new InvalidOperationException($"{label} ('{key}') debe tener al menos 32 caracteres.");
    if (isDev) return devFallback;
    throw new InvalidOperationException(
        $"Falta {label}. Configurá '{key}' por variable de entorno o secreto en producción.");
}

// En hosts como Render se inyecta el puerto por la variable PORT. Si está, escuchamos ahí
// (en 0.0.0.0). En local no está definida, así que se respeta ASPNETCORE_URLS (p. ej. 5080).
var port = Environment.GetEnvironmentVariable("PORT");
if (!string.IsNullOrWhiteSpace(port))
    builder.WebHost.UseUrls($"http://0.0.0.0:{port}");

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Capa de infraestructura (EF Core + Supabase + casos de uso).
builder.Services.AddMamboInfrastructure(builder.Configuration, isDevelopment);

// Identidad del usuario actual a partir del JWT.
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ICurrentUser, CurrentUser>();

// Autenticación: JWT propio (HS256). Diseñado para sumar Supabase Auth más adelante.
// El secreto se resuelve una sola vez acá (fuente única de verdad) y se comparte con el emisor.
var jwtKey = ResolveSecret(builder.Configuration, "Jwt:Key", isDevelopment, devJwtKey, "La clave de firma JWT");
var jwtIssuer = builder.Configuration["Jwt:Issuer"] ?? "mambo";
var jwtAudience = builder.Configuration["Jwt:Audience"] ?? "mambo";
// Access token de corta vida (minutos); la sesión se prolonga con refresh tokens (días).
var accessMinutes = int.TryParse(builder.Configuration["Jwt:AccessMinutes"], out var am) ? am : 30;
var refreshDays = int.TryParse(builder.Configuration["Jwt:RefreshDays"], out var rd) ? rd : 30;

// El emisor de JWT (Infrastructure) consume estos mismos parámetros ya resueltos.
builder.Services.AddSingleton(new JwtOptions(jwtKey, jwtIssuer, jwtAudience, accessMinutes, refreshDays));
// Vida del refresh token para AuthService (Application).
builder.Services.AddSingleton(new Mambo.Application.UseCases.RefreshTokenOptions(refreshDays));

// Secreto propio e independiente para firmar los tokens rotativos del QR de clase (Modo B).
// No reutiliza la clave JWT (SEC-04): dominios de confianza separados.
var qrSecret = ResolveSecret(builder.Configuration, "Qr:Secret", isDevelopment, devQrSecret, "El secreto de firma del QR");
builder.Services.AddSingleton(new Mambo.Application.UseCases.QrTokenOptions(qrSecret));

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwtIssuer,
            ValidateAudience = true,
            ValidAudience = jwtAudience,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(System.Text.Encoding.UTF8.GetBytes(jwtKey))
        };
    });

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("Admin", p => p.RequireRole("admin"));
    options.AddPolicy("TeacherOrAdmin", p => p.RequireRole("teacher", "admin"));
});

builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.WithOrigins(builder.Configuration["Cors:Origins"]?.Split(';') ?? ["http://localhost:3000"])
     .AllowAnyHeader().AllowAnyMethod()));

// SEC-05: detrás del proxy de Render el request llega por HTTP con el esquema/IP originales
// en cabeceras X-Forwarded-*. Confiamos en el proxy de la plataforma (red dinámica → limpiamos
// las listas de proxies conocidos). Esto además da la IP real para el rate limiting (SEC-07).
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.KnownNetworks.Clear();
    options.KnownProxies.Clear();
});

// SEC-07: rate limiting para frenar fuerza bruta / credential stuffing en el login.
// Ventana fija por IP: 20 intentos cada 5 minutos; el excedente recibe 429.
// (Se elige 20 y no 10 porque el personal comparte la IP del wifi de la academia; 20/5min
// sigue haciendo inviable la fuerza bruta sin bloquear a usuarios legítimos que se equivocan.)
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("auth", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 20,
                Window = TimeSpan.FromMinutes(5),
                QueueLimit = 0,
            }));
});

var app = builder.Build();

// Desarrollo sin Docker: si el proveedor es SQLite, crear el esquema al arrancar.
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<Mambo.Infrastructure.Persistence.MamboDbContext>();
    if (db.Database.ProviderName?.Contains("Sqlite", StringComparison.OrdinalIgnoreCase) == true)
        db.Database.EnsureCreated();
}

// SEC-05: primero interpretar X-Forwarded-* para conocer esquema/IP reales.
app.UseForwardedHeaders();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}
else
{
    // SEC-05: HSTS (el TLS lo termina el borde de Render; esto instruye al navegador
    // a usar siempre HTTPS). No se usa UseHttpsRedirection para no romper el health-check
    // interno por HTTP ni generar bucles de redirección detrás del proxy.
    app.UseHsts();
}

app.UseCors();
app.UseRateLimiter();   // SEC-07
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

app.Run();
