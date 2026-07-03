using Mambo.Api.Auth;
using Mambo.Infrastructure;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

// En hosts como Render se inyecta el puerto por la variable PORT. Si está, escuchamos ahí
// (en 0.0.0.0). En local no está definida, así que se respeta ASPNETCORE_URLS (p. ej. 5080).
var port = Environment.GetEnvironmentVariable("PORT");
if (!string.IsNullOrWhiteSpace(port))
    builder.WebHost.UseUrls($"http://0.0.0.0:{port}");

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Capa de infraestructura (EF Core + Supabase + casos de uso).
builder.Services.AddMamboInfrastructure(builder.Configuration);

// Identidad del usuario actual a partir del JWT.
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ICurrentUser, CurrentUser>();

// Autenticación: JWT propio (HS256). Diseñado para sumar Supabase Auth más adelante.
var jwtKey = builder.Configuration["Jwt:Key"] ?? "dev-only-insecure-key-change-me-please-32+chars";
var jwtIssuer = builder.Configuration["Jwt:Issuer"] ?? "mambo";
var jwtAudience = builder.Configuration["Jwt:Audience"] ?? "mambo";

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
