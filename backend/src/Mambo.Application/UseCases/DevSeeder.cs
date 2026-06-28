using Mambo.Application.Abstractions;
using Mambo.Domain;
using Mambo.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Mambo.Application.UseCases;

/// <summary>
/// Crea datos de demostración para desarrollo local (idempotente).
/// Usuarios: admin@mambo.local / Admin1234! · profe@mambo.local / Profe1234! ·
///           ana@mambo.local, leo@mambo.local / Alumno1234!
/// </summary>
public class DevSeeder(IMamboDbContext db, IPasswordHasher hasher, IClock clock)
{
    public async Task<string> SeedAsync(CancellationToken ct = default)
    {
        await EnsureRolesAndPassTypesAsync(ct);

        if (await db.Users.AnyAsync(u => u.Email == "admin@mambo.local", ct))
            return "Los datos demo ya existían.";

        var now = clock.UtcNow;
        var today = DateOnly.FromDateTime(now);

        await CreateUserAsync("admin@mambo.local", "Admin1234!", "Administrador Demo", 1, ct);
        var (_, teacher) = await CreateTeacherAsync("profe@mambo.local", "Profe1234!", "Profe Demo", ct);

        var ana = await CreateStudentAsync("ana@mambo.local", "Alumno1234!", "Ana Pérez", "STU-ANA-001", ct);
        var leo = await CreateStudentAsync("leo@mambo.local", "Alumno1234!", "Leo Gómez", "STU-LEO-002", ct);

        // Ana: pack de 8 con saldo. Leo: pack agotado (escenario de deuda).
        await AddPassAsync(ana, PassKind.ClassPack, balance: 6, initial: 8, today, paid: true, ct);
        await AddPassAsync(leo, PassKind.ClassPack, balance: 0, initial: 8, today, paid: true, ct);

        // Pago confirmado de ejemplo para Ana.
        db.Payments.Add(new Payment
        {
            Id = Guid.NewGuid(), StudentId = ana, Amount = 2200m, Method = "efectivo",
            Status = PaymentStatus.Confirmed, Concept = "Pack 8 clases", PaidAt = today,
            CreatedAt = now, UpdatedAt = now
        });

        // Clase de hoy con sesión "terminando pronto" (ventana abierta ahora).
        var cls = new DanceClass
        {
            Id = Guid.NewGuid(), Name = "Salsa Intermedios", Style = "Salsa", Level = "Intermedio",
            Weekday = (short)((int)today.DayOfWeek), StartTime = new TimeOnly(20, 0), EndTime = new TimeOnly(21, 30),
            IsActive = true, CreatedAt = now, UpdatedAt = now
        };
        db.Classes.Add(cls);
        db.ClassTeachers.Add(new ClassTeacher { ClassId = cls.Id, TeacherId = teacher });

        var session = new ClassSession
        {
            Id = Guid.NewGuid(), ClassId = cls.Id, SessionDate = today,
            StartAt = now.AddMinutes(-80), EndAt = now.AddMinutes(10), // ventana [-5, +40] contiene ahora
            Status = "scheduled", CreatedAt = now
        };
        db.Sessions.Add(session);

        // Asistencias pendientes para el panel del profesor.
        foreach (var sid in new[] { ana, leo })
            db.Attendances.Add(new Attendance
            {
                Id = Guid.NewGuid(), StudentId = sid, ClassSessionId = session.Id,
                Status = AttendanceStatus.Pending, Source = AttendanceSource.ManualAdmin,
                CheckedInAt = now, CreatedAt = now, UpdatedAt = now
            });

        await db.SaveChangesAsync(ct);
        return "Datos demo creados: admin@mambo.local / Admin1234!, profe@mambo.local / Profe1234!, ana@/leo@mambo.local / Alumno1234!";
    }

    private async Task EnsureRolesAndPassTypesAsync(CancellationToken ct)
    {
        if (!await db.Roles.AnyAsync(ct))
        {
            db.Roles.Add(new Role { Id = 1, Code = AppRole.Admin, Name = "Administrador" });
            db.Roles.Add(new Role { Id = 2, Code = AppRole.Teacher, Name = "Profesor" });
            db.Roles.Add(new Role { Id = 3, Code = AppRole.Student, Name = "Alumno" });
            await db.SaveChangesAsync(ct);
        }
    }

    private async Task<AppUser> CreateUserAsync(string email, string pass, string name, short roleId, CancellationToken ct)
    {
        var u = new AppUser
        {
            Id = Guid.NewGuid(), Email = email, FullName = name,
            PasswordHash = hasher.Hash(pass), IsActive = true,
            CreatedAt = clock.UtcNow, UpdatedAt = clock.UtcNow
        };
        db.Users.Add(u);
        db.UserRoles.Add(new UserRole { UserId = u.Id, RoleId = roleId });
        await db.SaveChangesAsync(ct);
        return u;
    }

    private async Task<(AppUser, Guid)> CreateTeacherAsync(string email, string pass, string name, CancellationToken ct)
    {
        var u = await CreateUserAsync(email, pass, name, 2, ct);
        var t = new Teacher { Id = Guid.NewGuid(), UserId = u.Id, IsActive = true, CreatedAt = clock.UtcNow, UpdatedAt = clock.UtcNow };
        db.Teachers.Add(t);
        await db.SaveChangesAsync(ct);
        return (u, t.Id);
    }

    private async Task<Guid> CreateStudentAsync(string email, string pass, string name, string qr, CancellationToken ct)
    {
        var u = await CreateUserAsync(email, pass, name, 3, ct);
        var s = new Student
        {
            Id = Guid.NewGuid(), UserId = u.Id, QrFixedCode = qr, IsActive = true,
            CreatedAt = clock.UtcNow, UpdatedAt = clock.UtcNow
        };
        db.Students.Add(s);
        await db.SaveChangesAsync(ct);
        return s.Id;
    }

    private async Task AddPassAsync(Guid studentId, PassKind kind, int balance, int initial, DateOnly today, bool paid, CancellationToken ct)
    {
        var passType = await db.PassTypes.FirstAsync(pt => pt.Kind == kind, ct);
        var pass = new Pass
        {
            Id = Guid.NewGuid(), StudentId = studentId, PassTypeId = passType.Id, Kind = kind,
            InitialCount = initial, Balance = 0, ValidFrom = today, ValidTo = today.AddDays(30),
            Status = PassStatus.Active, IsPaid = paid, CreatedAt = clock.UtcNow, UpdatedAt = clock.UtcNow
        };
        db.Passes.Add(pass);
        await db.SaveChangesAsync(ct);
        // Crédito inicial vía ledger (el trigger de BD ajusta balance; en memoria lo fijamos).
        if (balance != 0)
        {
            db.LedgerEntries.Add(new PassLedgerEntry
            {
                Id = Guid.NewGuid(), PassId = pass.Id, Delta = balance,
                Reason = LedgerReason.PurchaseCredit, CreatedAt = clock.UtcNow
            });
            pass.Balance = balance;
            await db.SaveChangesAsync(ct);
        }
    }
}
