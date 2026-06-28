using Mambo.Api.Auth;
using Mambo.Infrastructure;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Capa de infraestructura (EF Core + Supabase + casos de uso).
builder.Services.AddMamboInfrastructure(builder.Configuration);

// Identidad del usuario actual a partir del JWT.
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ICurrentUser, CurrentUser>();

// Autenticación: validación del JWT emitido por Supabase Auth.
var supabaseUrl = builder.Configuration["Supabase:Url"] ?? builder.Configuration["SUPABASE_URL"];
var jwtSecret = builder.Configuration["Supabase:JwtSecret"] ?? builder.Configuration["SUPABASE_JWT_SECRET"];

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        // Supabase firma con HS256 usando el JWT secret del proyecto.
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = !string.IsNullOrEmpty(supabaseUrl),
            ValidIssuer = string.IsNullOrEmpty(supabaseUrl) ? null : $"{supabaseUrl}/auth/v1",
            ValidateAudience = true,
            ValidAudience = "authenticated",
            ValidateLifetime = true,
            ValidateIssuerSigningKey = !string.IsNullOrEmpty(jwtSecret),
            IssuerSigningKey = string.IsNullOrEmpty(jwtSecret)
                ? null
                : new SymmetricSecurityKey(System.Text.Encoding.UTF8.GetBytes(jwtSecret)),
            RoleClaimType = "app_role"
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
