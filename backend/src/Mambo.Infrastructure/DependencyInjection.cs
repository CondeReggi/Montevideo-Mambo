using Mambo.Application.Abstractions;
using Mambo.Application.UseCases;
using Mambo.Infrastructure.Persistence;
using Mambo.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Mambo.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddMamboInfrastructure(this IServiceCollection services, IConfiguration config)
    {
        // Proveedor de base de datos. Por defecto PostgreSQL (Supabase/Docker).
        // Para desarrollo sin Docker se puede usar SQLite con "Database:Provider=Sqlite".
        var provider = config["Database:Provider"] ?? "Npgsql";

        if (string.Equals(provider, "Sqlite", StringComparison.OrdinalIgnoreCase))
        {
            var sqliteConn = config.GetConnectionString("Sqlite")
                             ?? config.GetConnectionString("Supabase")
                             ?? "Data Source=mambo_dev.db";
            services.AddDbContext<MamboDbContext>(opt =>
                opt.UseSqlite(sqliteConn).UseSnakeCaseNamingConvention());
        }
        else
        {
            var conn = config.GetConnectionString("Supabase")
                       ?? config["SUPABASE_DB_CONNECTION"]
                       ?? throw new InvalidOperationException("Falta la cadena de conexión 'Supabase'.");

            var dsBuilder = new Npgsql.NpgsqlDataSourceBuilder(conn);
            dsBuilder.MapEnum<Domain.AppRole>("app_role");
            dsBuilder.MapEnum<Domain.AttendanceStatus>("attendance_status");
            dsBuilder.MapEnum<Domain.AttendanceSource>("attendance_source");
            dsBuilder.MapEnum<Domain.PassKind>("pass_kind");
            dsBuilder.MapEnum<Domain.PassStatus>("pass_status");
            dsBuilder.MapEnum<Domain.PaymentStatus>("payment_status");
            dsBuilder.MapEnum<Domain.LedgerReason>("ledger_reason");
            var dataSource = dsBuilder.Build();

            services.AddDbContext<MamboDbContext>(opt =>
                opt.UseNpgsql(dataSource).UseSnakeCaseNamingConvention());
        }
        services.AddScoped<IMamboDbContext>(sp => sp.GetRequiredService<MamboDbContext>());

        services.AddSingleton<IClock, SystemClock>();
        services.AddScoped<IAuditService, AuditService>();
        services.AddHttpClient();
        services.AddScoped<IPhotoStorage, SupabasePhotoStorage>();
        services.AddSingleton<IPasswordHasher, Pbkdf2PasswordHasher>();
        services.AddSingleton<IJwtIssuer, JwtIssuer>();

        // Token rotativo del QR de clase (Modo B). Secreto propio o, en su defecto, la clave JWT.
        var qrSecret = config["Qr:Secret"] ?? config["Jwt:Key"]
                       ?? throw new InvalidOperationException("Falta 'Qr:Secret' o 'Jwt:Key' para firmar los QR.");
        services.AddSingleton(new QrTokenOptions(qrSecret));
        services.AddScoped<SessionQrService>();

        // Casos de uso
        services.AddScoped<CheckInService>();
        services.AddScoped<AttendanceConfirmationService>();
        services.AddScoped<StudentSummaryService>();
        services.AddScoped<AuthService>();
        services.AddScoped<AdminService>();
        services.AddScoped<BillingService>();
        services.AddScoped<StudentPanelService>();
        services.AddScoped<AlertsService>();
        services.AddScoped<DevSeeder>();

        return services;
    }
}
