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
        services.AddScoped<IMamboDbContext>(sp => sp.GetRequiredService<MamboDbContext>());

        services.AddSingleton<IClock, SystemClock>();
        services.AddScoped<IAuditService, AuditService>();
        services.AddHttpClient();
        services.AddScoped<IPhotoStorage, SupabasePhotoStorage>();
        services.AddSingleton<IPasswordHasher, Pbkdf2PasswordHasher>();
        services.AddSingleton<IJwtIssuer, JwtIssuer>();

        // Casos de uso
        services.AddScoped<CheckInService>();
        services.AddScoped<AttendanceConfirmationService>();
        services.AddScoped<StudentSummaryService>();
        services.AddScoped<AuthService>();
        services.AddScoped<AdminService>();
        services.AddScoped<StudentPanelService>();
        services.AddScoped<DevSeeder>();

        return services;
    }
}
