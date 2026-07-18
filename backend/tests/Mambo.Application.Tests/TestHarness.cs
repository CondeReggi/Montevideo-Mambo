using Mambo.Application.Abstractions;
using Mambo.Application.UseCases;
using Mambo.Domain;
using Mambo.Domain.Entities;
using Mambo.Infrastructure.Persistence;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Mambo.Application.Tests;

/// <summary>
/// Reloj fijo para los tests (el negocio calcula ventanas en el backend, nunca con el
/// reloj del cliente; congelarlo hace los tests deterministas).
/// </summary>
public sealed class FakeClock(DateTime utcNow) : IClock
{
    public DateTime UtcNow { get; set; } = utcNow;
}

/// <summary>Auditoría de mentira: acumula en memoria para poder afirmar sobre ella.</summary>
public sealed class FakeAudit : IAuditService
{
    public List<(Guid Actor, string Action, string Entity, Guid EntityId)> Records { get; } = new();

    public void Record(Guid? actorUserId, string action, string entity, Guid entityId, object? data = null) =>
        Records.Add((actorUserId ?? Guid.Empty, action, entity, entityId));
}

/// <summary>
/// Envío push de mentira: acumula lo enviado en memoria y permite simular que un
/// endpoint ya no existe (Gone) o que la config está apagada.
/// </summary>
public sealed class FakePushSender : IPushSender
{
    public bool IsConfigured { get; set; } = true;
    public string? PublicKey { get; set; } = "TEST_VAPID_PUBLIC_KEY";
    public List<(string Endpoint, PushMessage Message)> Sent { get; } = new();
    public HashSet<string> GoneEndpoints { get; } = new();

    public Task<PushDeliveryResult> SendAsync(PushDevice device, PushMessage message, CancellationToken ct = default)
    {
        if (!IsConfigured) return Task.FromResult(PushDeliveryResult.Error);
        if (GoneEndpoints.Contains(device.Endpoint)) return Task.FromResult(PushDeliveryResult.Gone);
        Sent.Add((device.Endpoint, message));
        return Task.FromResult(PushDeliveryResult.Ok);
    }
}

/// <summary>
/// Base de datos SQLite EN MEMORIA con el esquema real del MamboDbContext.
/// Se usa SQLite (no InMemory de EF) porque respeta las constraints UNIQUE, que es
/// justo lo que varios de estos tests necesitan verificar.
/// Nota: la conexión se mantiene abierta mientras viva el harness; al cerrarla se borra la BD.
/// </summary>
public sealed class TestDb : IAsyncDisposable
{
    private readonly SqliteConnection _conn;
    public MamboDbContext Db { get; }
    public FakeClock Clock { get; }
    public FakeAudit Audit { get; } = new();
    public FakePushSender PushSender { get; } = new();
    /// <summary>PushService de prueba sobre esta misma BD y el FakePushSender.</summary>
    public PushService Push => new(Db, Clock, PushSender);

    public TestDb(DateTime? nowUtc = null)
    {
        _conn = new SqliteConnection("Filename=:memory:");
        _conn.Open();
        var options = new DbContextOptionsBuilder<MamboDbContext>()
            .UseSqlite(_conn)
            .UseSnakeCaseNamingConvention()
            .Options;
        Db = new MamboDbContext(options);
        Db.Database.EnsureCreated();
        Clock = new FakeClock(nowUtc ?? new DateTime(2026, 7, 17, 23, 0, 0, DateTimeKind.Utc));
    }

    /// <summary>Crea un contexto NUEVO sobre la MISMA base (para simular otra request/concurrencia).</summary>
    public MamboDbContext NewContext()
    {
        var options = new DbContextOptionsBuilder<MamboDbContext>()
            .UseSqlite(_conn)
            .UseSnakeCaseNamingConvention()
            .Options;
        return new MamboDbContext(options);
    }

    public async ValueTask DisposeAsync()
    {
        await Db.DisposeAsync();
        _conn.Dispose();
    }
}

/// <summary>Constructores de datos de prueba (alumno, clase, sesión, cuponera).</summary>
public static class Make
{
    public static async Task<Student> StudentAsync(TestDb h, string qr = "STU-TEST-001", bool active = true)
    {
        var user = new AppUser
        {
            Id = Guid.NewGuid(),
            Email = $"{qr.ToLowerInvariant()}@test.uy",
            FullName = "Alumno Test",
            IsActive = active,
            CreatedAt = h.Clock.UtcNow,
            UpdatedAt = h.Clock.UtcNow
        };
        var student = new Student
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            QrFixedCode = qr,
            IsActive = active,
            CreatedAt = h.Clock.UtcNow,
            UpdatedAt = h.Clock.UtcNow
        };
        h.Db.Users.Add(user);
        h.Db.Students.Add(student);
        await h.Db.SaveChangesAsync();
        return student;
    }

    public static async Task<AppUser> ActorAsync(TestDb h)
    {
        var user = new AppUser
        {
            Id = Guid.NewGuid(),
            Email = $"profe-{Guid.NewGuid():N}@test.uy",
            FullName = "Profe Test",
            IsActive = true,
            CreatedAt = h.Clock.UtcNow,
            UpdatedAt = h.Clock.UtcNow
        };
        h.Db.Users.Add(user);
        await h.Db.SaveChangesAsync();
        return user;
    }

    /// <summary>Sesión que TERMINA en 'endsAt' (por defecto: ahora, o sea dentro de la ventana).</summary>
    public static async Task<ClassSession> SessionAsync(TestDb h, DateTime? endsAtUtc = null, string status = "scheduled")
    {
        var end = endsAtUtc ?? h.Clock.UtcNow;
        var start = end.AddMinutes(-90);

        var danceClass = new DanceClass
        {
            Id = Guid.NewGuid(),
            Name = "Salsa Test",
            Style = "Salsa",
            Level = "Intermedios",
            Weekday = (short)start.DayOfWeek,
            StartTime = TimeOnly.FromDateTime(start),
            EndTime = TimeOnly.FromDateTime(end),
            IsActive = true,
            CreatedAt = h.Clock.UtcNow,
            UpdatedAt = h.Clock.UtcNow
        };
        var session = new ClassSession
        {
            Id = Guid.NewGuid(),
            ClassId = danceClass.Id,
            // 'hoy' del negocio = fecha LOCAL de Montevideo (ver IClock.LocalToday / fix F4).
            SessionDate = DateOnly.FromDateTime(h.Clock.LocalNow()),
            StartAt = start,
            EndAt = end,
            Status = status,
            CreatedAt = h.Clock.UtcNow
        };
        h.Db.Classes.Add(danceClass);
        h.Db.Sessions.Add(session);
        await h.Db.SaveChangesAsync();
        return session;
    }

    public static async Task<Pass> PassAsync(TestDb h, Guid studentId, int balance,
        PassKind kind = PassKind.ClassPack, decimal price = 1200m, int validToOffsetDays = 25,
        PassStatus status = PassStatus.Active, bool isPaid = true)
    {
        var today = DateOnly.FromDateTime(h.Clock.LocalNow());
        var type = new PassType
        {
            Id = Guid.NewGuid(),
            Name = $"Pack Test {Guid.NewGuid():N}",
            Kind = kind,
            ClassCount = kind == PassKind.ClassPack ? 8 : null,
            Price = price,
            ValidityDays = 30,
            IsActive = true
        };
        var pass = new Pass
        {
            Id = Guid.NewGuid(),
            StudentId = studentId,
            PassTypeId = type.Id,
            Kind = kind,
            InitialCount = type.ClassCount,
            Balance = balance,
            ValidFrom = today.AddDays(-5),
            ValidTo = today.AddDays(validToOffsetDays),
            Status = status,
            IsPaid = isPaid,
            CreatedAt = h.Clock.UtcNow,
            UpdatedAt = h.Clock.UtcNow
        };
        h.Db.PassTypes.Add(type);
        h.Db.Passes.Add(pass);
        await h.Db.SaveChangesAsync();
        return pass;
    }

    public static async Task<Attendance> AttendanceAsync(TestDb h, Guid studentId, Guid sessionId,
        AttendanceStatus status = AttendanceStatus.Pending)
    {
        var att = new Attendance
        {
            Id = Guid.NewGuid(),
            StudentId = studentId,
            ClassSessionId = sessionId,
            Status = status,
            Source = AttendanceSource.QrAcademy,
            CheckedInAt = h.Clock.UtcNow,
            CreatedAt = h.Clock.UtcNow,
            UpdatedAt = h.Clock.UtcNow
        };
        h.Db.Attendances.Add(att);
        await h.Db.SaveChangesAsync();
        return att;
    }

    /// <summary>Saldo REAL de una cuponera = suma del ledger (fuente de verdad, D4/D11).</summary>
    public static async Task<int> LedgerBalanceAsync(TestDb h, Guid passId) =>
        await h.Db.LedgerEntries.Where(l => l.PassId == passId).SumAsync(l => l.Delta);
}
