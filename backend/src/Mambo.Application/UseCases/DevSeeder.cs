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
        var today = clock.LocalToday();

        await CreateUserAsync("admin@mambo.local", "Admin1234!", "Administrador Demo", 1, ct);
        var (_, teacher) = await CreateTeacherAsync("profe@mambo.local", "Profe1234!", "Profe Demo", ct);

        var ana = await CreateStudentAsync("ana@mambo.local", "Alumno1234!", "Ana Pérez", "STU-ANA-001", ct);
        var leo = await CreateStudentAsync("leo@mambo.local", "Alumno1234!", "Leo Gómez", "STU-LEO-002", ct);

        // Ana: pack de 8 con saldo. Leo: pack agotado (escenario de deuda).
        await AddPassAsync(ana, PassKind.ClassPack, balance: 6, initial: 8, today, paid: true, ct);
        await AddPassAsync(leo, PassKind.ClassPack, balance: 0, initial: 8, today, paid: true, ct);
        // Cuponera de ana casi vencida y con última clase → dispara avisos críticos (demo).
        await AddPassAsync(ana, PassKind.ClassPack, balance: 1, initial: 4, today, paid: true, ct, validityDays: 3);
        // Clase suelta sin usar → aviso ámbar (NO crítico), para contrastar con el rojo.
        await AddPassAsync(ana, PassKind.SingleClass, balance: 1, initial: 1, today, paid: true, ct);

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
            // Horario 12:00–13:30 (fuera de la grilla 2026) para NO chocar con la
            // restricción de no-solape de Postgres si también se corre seed-horarios.
            // La sesión demo usa horario relativo a "ahora" (abajo), no este.
            Weekday = (short)((int)today.DayOfWeek), StartTime = new TimeOnly(12, 0), EndTime = new TimeOnly(13, 30),
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

    /// <summary>
    /// Carga la grilla real de clases 2026 (ver /Referencias/horarios.webp). Idempotente:
    /// no duplica una clase si ya existe una con el mismo (día, hora de inicio).
    /// </summary>
    public async Task<string> SeedHorarios2026Async(CancellationToken ct = default)
    {
        await EnsureRolesAndPassTypesAsync(ct);
        var now = clock.UtcNow;

        // (weekday 0=Dom..6=Sáb, inicio, fin, nombre, estilo, nivel)
        var grid = new (short Wd, string Start, string End, string Name, string Style, string Level)[]
        {
            // Lunes
            (1,"18:30","19:30","Ritmos para niñ@s","Ritmos","Niños"),
            (1,"19:30","20:30","Curso Salsa Principiantes","Salsa","Principiantes"),
            (1,"20:30","21:30","Curso Salsa Principiantes-Avanzados","Salsa","Princ.-Avanzados"),
            (1,"21:30","22:30","Cubafusión","Cubafusión","Todos"),
            // Martes
            (2,"18:30","19:30","Estilo Femenino Salsa","Salsa","Estilo Femenino"),
            (2,"19:30","20:30","Bachata Principiantes-Avanzados","Bachata","Princ.-Avanzados"),
            (2,"20:30","21:30","Salsa Intermedio","Salsa","Intermedio"),
            (2,"21:30","22:30","Ensayos Coreográficos","Coreografía","Todos"),
            // Miércoles
            (3,"18:30","19:30","Ritmos para niñ@s","Ritmos","Niños"),
            (3,"19:30","20:30","Curso Salsa Principiantes","Salsa","Principiantes"),
            (3,"20:30","21:30","Curso Salsa Principiantes-Avanzados","Salsa","Princ.-Avanzados"),
            (3,"21:30","22:30","Cubafusión","Cubafusión","Todos"),
            // Jueves
            (4,"18:30","19:30","Bachata Principiantes","Bachata","Principiantes"),
            (4,"19:30","20:30","Bachata Principiantes-Avanzados","Bachata","Princ.-Avanzados"),
            (4,"20:30","21:30","Salsa Intermedio","Salsa","Intermedio"),
            (4,"21:30","22:30","Taller Mensual","Taller","Todos"),
            // Viernes
            (5,"18:30","19:30","Estilo Femenino Bachata","Bachata","Estilo Femenino"),
            (5,"19:30","20:30","Rueda de Casino","Casino","Todos"),
            (5,"20:30","21:30","Mambo Shines / Parejas","Mambo","Todos"),
            (5,"21:30","22:30","Ensayos Coreográficos","Coreografía","Todos"),
            // Sábado
            (6,"14:00","15:00","Bachata Principiantes","Bachata","Principiantes"),
            (6,"15:00","16:00","Salsa Principiantes","Salsa","Principiantes"),
            (6,"16:00","17:00","Salsa Principiantes-Avanzados","Salsa","Princ.-Avanzados"),
        };

        var teacherId = await db.Teachers.Select(t => (Guid?)t.Id).FirstOrDefaultAsync(ct);
        var existing = await db.Classes.Select(c => new { c.Weekday, c.StartTime }).ToListAsync(ct);
        int added = 0;

        foreach (var g in grid)
        {
            var start = TimeOnly.Parse(g.Start);
            if (existing.Any(e => e.Weekday == g.Wd && e.StartTime == start)) continue;

            var cls = new DanceClass
            {
                Id = Guid.NewGuid(), Name = g.Name, Style = g.Style, Level = g.Level,
                Weekday = g.Wd, StartTime = start, EndTime = TimeOnly.Parse(g.End),
                IsActive = true, CreatedAt = now, UpdatedAt = now
            };
            db.Classes.Add(cls);
            if (teacherId is Guid tid)
                db.ClassTeachers.Add(new ClassTeacher { ClassId = cls.Id, TeacherId = tid });
            added++;
        }

        await db.SaveChangesAsync(ct);
        return added == 0
            ? "La grilla de horarios 2026 ya estaba cargada."
            : $"Horarios 2026 cargados: {added} clase(s) agregada(s).";
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

        // Catálogo de cuponeras (equivale a db/seed/001_seed_base.sql, para el proveedor SQLite dev).
        if (!await db.PassTypes.AnyAsync(ct))
        {
            db.PassTypes.Add(new PassType { Id = Guid.NewGuid(), Name = "Clase suelta", Kind = PassKind.SingleClass, ClassCount = 1, Price = 350.00m, ValidityDays = 30, IsActive = true });
            db.PassTypes.Add(new PassType { Id = Guid.NewGuid(), Name = "Pack 4 clases", Kind = PassKind.ClassPack, ClassCount = 4, Price = 1200.00m, ValidityDays = 30, IsActive = true });
            db.PassTypes.Add(new PassType { Id = Guid.NewGuid(), Name = "Pack 8 clases", Kind = PassKind.ClassPack, ClassCount = 8, Price = 2200.00m, ValidityDays = 30, IsActive = true });
            db.PassTypes.Add(new PassType { Id = Guid.NewGuid(), Name = "Pack 12 clases", Kind = PassKind.ClassPack, ClassCount = 12, Price = 3000.00m, ValidityDays = 30, IsActive = true });
            db.PassTypes.Add(new PassType { Id = Guid.NewGuid(), Name = "Pase libre mensual", Kind = PassKind.UnlimitedMonth, ClassCount = null, Price = 3800.00m, ValidityDays = 30, IsActive = true });
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

    private async Task AddPassAsync(Guid studentId, PassKind kind, int balance, int initial, DateOnly today, bool paid, CancellationToken ct, int validityDays = 30)
    {
        var passType = await db.PassTypes.FirstAsync(pt => pt.Kind == kind, ct);
        var pass = new Pass
        {
            Id = Guid.NewGuid(), StudentId = studentId, PassTypeId = passType.Id, Kind = kind,
            InitialCount = initial, Balance = 0, ValidFrom = today, ValidTo = today.AddDays(validityDays),
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
