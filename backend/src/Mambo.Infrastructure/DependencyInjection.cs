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
    public static IServiceCollection AddMamboInfrastructure(this IServiceCollection services, IConfiguration config, bool isDevelopment = false)
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
            var conn = config.GetConnectionString("Supabase") ?? config["SUPABASE_DB_CONNECTION"];
            if (string.IsNullOrWhiteSpace(conn))
            {
                // En Development se permite el Postgres local de Docker (no es un secreto real).
                // En producción la cadena DEBE venir por variable de entorno / secreto (SEC-22).
                conn = isDevelopment
                    ? "Host=localhost;Port=55432;Database=mambo;Username=postgres;Password=postgres"
                    : throw new InvalidOperationException(
                        "Falta la cadena de conexión 'Supabase'. Configurala por variable de entorno en producción.");
            }

            var dsBuilder = new Npgsql.NpgsqlDataSourceBuilder(conn);
            dsBuilder.MapEnum<Domain.AppRole>("app_role");
            dsBuilder.MapEnum<Domain.AttendanceStatus>("attendance_status");
            dsBuilder.MapEnum<Domain.AttendanceSource>("attendance_source");
            dsBuilder.MapEnum<Domain.PassKind>("pass_kind");
            dsBuilder.MapEnum<Domain.PassStatus>("pass_status");
            dsBuilder.MapEnum<Domain.PaymentStatus>("payment_status");
            dsBuilder.MapEnum<Domain.PaymentIntentStatus>("payment_intent_status");
            dsBuilder.MapEnum<Domain.LedgerReason>("ledger_reason");
            var dataSource = dsBuilder.Build();

            services.AddDbContext<MamboDbContext>(opt =>
                opt.UseNpgsql(dataSource).UseSnakeCaseNamingConvention());
        }
        services.AddScoped<IMamboDbContext>(sp => sp.GetRequiredService<MamboDbContext>());

        services.AddSingleton<IClock, SystemClock>();
        services.AddScoped<IAuditService, AuditService>();
        services.AddHttpClient();
        services.AddMemoryCache(); // PERF-05: caché de signed URLs de fotos.
        services.AddScoped<IPhotoStorage, SupabasePhotoStorage>();
        services.AddSingleton<IPasswordHasher, Pbkdf2PasswordHasher>();
        services.AddSingleton<IJwtIssuer, JwtIssuer>();

        // El secreto del QR (QrTokenOptions) se resuelve y registra en Program.cs, junto al JWT,
        // con la misma política de fail-fast y sin reutilizar la clave JWT (SEC-04).
        services.AddScoped<SessionQrService>();

        // Casos de uso
        services.AddScoped<CheckInService>();
        services.AddScoped<AttendanceConfirmationService>();
        services.AddScoped<StudentSummaryService>();
        services.AddScoped<AuthService>();
        services.AddScoped<AdminService>();
        services.AddScoped<BillingService>();
        // Pasarela de pago. Si no hay credenciales, IsConfigured=false y la UI muestra
        // "próximamente" en vez de ofrecer el pago (la app no se rompe).
        services.AddScoped<IPaymentGateway, MercadoPagoGateway>();
        services.AddScoped<CheckoutService>();
        services.AddScoped<StudentPanelService>();
        services.AddScoped<AlertsService>();
        services.AddScoped<ContentService>();
        // Notificaciones push (Web Push/VAPID). Si no hay claves, IsConfigured=false
        // y la app no ofrece notificaciones (la app no se rompe).
        services.AddSingleton<IPushSender, WebPushSender>();
        services.AddScoped<PushService>();
        services.AddScoped<DevSeeder>();

        return services;
    }
}
