using Mambo.Api.Auth;
using Mambo.Infrastructure;
using Mambo.Infrastructure.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
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
var jwtExpiresHours = int.TryParse(builder.Configuration["Jwt:ExpiresHours"], out var h) ? h : 12;

// El emisor de JWT (Infrastructure) consume estos mismos parámetros ya resueltos.
builder.Services.AddSingleton(new JwtOptions(jwtKey, jwtIssuer, jwtAudience, jwtExpiresHours));

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

var app = builder.Build();

// Desarrollo sin Docker: si el proveedor es SQLite, crear el esquema al arrancar.
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<Mambo.Infrastructure.Persistence.MamboDbContext>();
    if (db.Database.ProviderName?.Contains("Sqlite", StringComparison.OrdinalIgnoreCase) == true)
        db.Database.EnsureCreated();
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

app.Run();
