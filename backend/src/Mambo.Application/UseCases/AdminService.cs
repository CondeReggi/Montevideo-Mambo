using Mambo.Application.Abstractions;
using Mambo.Domain;
using Mambo.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Mambo.Application.UseCases;

public record CreateStudentInput(string FullName, string Email, string Password,
    string? DocumentId, string? Phone, string? QrFixedCode, string? PhotoPath);
public record CreateTeacherInput(string FullName, string Email, string Password, string? Bio);
public record CreateClassInput(string Name, string Style, string Level, short Weekday,
    string StartTime, string EndTime, string? Room, List<Guid> TeacherIds);
public record UpdateStudentInput(string FullName, string? Phone, string? DocumentId, string? Notes);
public record UpdateTeacherInput(string FullName, string? Bio);
public record UpdateClassInput(string Name, string Style, string Level, short Weekday,
    string StartTime, string EndTime, string? Room, List<Guid> TeacherIds);

/// <summary>Altas y mantenimiento de datos maestros (rol admin).</summary>
public class AdminService(IMamboDbContext db, IPasswordHasher hasher, IClock clock, IAuditService audit)
{
    private const short RoleStudent = 3;
    private const short RoleTeacher = 2;

    public async Task<Guid> CreateStudentAsync(CreateStudentInput i, Guid actor, CancellationToken ct = default)
    {
        var user = await CreateUserAsync(i.FullName, i.Email, i.Password, i.Phone, RoleStudent, ct);
        var student = new Student
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            DocumentId = i.DocumentId,
            PhotoPath = i.PhotoPath,
            QrFixedCode = string.IsNullOrWhiteSpace(i.QrFixedCode) ? $"STU-{Guid.NewGuid():N}"[..12] : i.QrFixedCode,
            IsActive = true,
            CreatedAt = clock.UtcNow,
            UpdatedAt = clock.UtcNow
        };
        db.Students.Add(student);
        await db.SaveChangesAsync(ct);
        audit.Record(actor, "create_student", "student", student.Id, new { i.Email });
        await db.SaveChangesAsync(ct);
        return student.Id;
    }

    public async Task<Guid> CreateTeacherAsync(CreateTeacherInput i, Guid actor, CancellationToken ct = default)
    {
        var user = await CreateUserAsync(i.FullName, i.Email, i.Password, null, RoleTeacher, ct);
        var teacher = new Teacher
        {
            Id = Guid.NewGuid(), UserId = user.Id, Bio = i.Bio, IsActive = true,
            CreatedAt = clock.UtcNow, UpdatedAt = clock.UtcNow
        };
        db.Teachers.Add(teacher);
        await db.SaveChangesAsync(ct);
        return teacher.Id;
    }

    public async Task<Guid> CreateClassAsync(CreateClassInput i, Guid actor, CancellationToken ct = default)
    {
        var cls = new DanceClass
        {
            Id = Guid.NewGuid(),
            Name = i.Name, Style = i.Style, Level = i.Level, Weekday = i.Weekday,
            StartTime = TimeOnly.Parse(i.StartTime), EndTime = TimeOnly.Parse(i.EndTime),
            Room = i.Room, IsActive = true, CreatedAt = clock.UtcNow, UpdatedAt = clock.UtcNow
        };
        db.Classes.Add(cls);
        foreach (var tId in i.TeacherIds.Distinct())
            db.ClassTeachers.Add(new ClassTeacher { ClassId = cls.Id, TeacherId = tId });
        await db.SaveChangesAsync(ct);
        audit.Record(actor, "create_class", "dance_class", cls.Id, new { i.Name });
        await db.SaveChangesAsync(ct);
        return cls.Id;
    }

    /// <summary>Edita los datos básicos de un alumno (no toca email ni contraseña).</summary>
    public async Task UpdateStudentAsync(Guid studentId, UpdateStudentInput i, Guid actor, CancellationToken ct = default)
    {
        var student = await db.Students.Include(s => s.User)
            .FirstOrDefaultAsync(s => s.Id == studentId, ct)
            ?? throw new InvalidOperationException("Alumno no encontrado.");
        if (string.IsNullOrWhiteSpace(i.FullName))
            throw new InvalidOperationException("El nombre no puede quedar vacío.");

        student.User.FullName = i.FullName.Trim();
        student.User.Phone = string.IsNullOrWhiteSpace(i.Phone) ? null : i.Phone.Trim();
        student.User.UpdatedAt = clock.UtcNow;
        student.DocumentId = string.IsNullOrWhiteSpace(i.DocumentId) ? null : i.DocumentId.Trim();
        student.Notes = string.IsNullOrWhiteSpace(i.Notes) ? null : i.Notes.Trim();
        student.UpdatedAt = clock.UtcNow;

        audit.Record(actor, "update_student", "student", student.Id, new { i.FullName });
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Activa o desactiva un alumno (baja lógica; su usuario también se inhabilita).</summary>
    public async Task SetStudentActiveAsync(Guid studentId, bool active, Guid actor, CancellationToken ct = default)
    {
        var student = await db.Students.Include(s => s.User)
            .FirstOrDefaultAsync(s => s.Id == studentId, ct)
            ?? throw new InvalidOperationException("Alumno no encontrado.");
        student.IsActive = active;
        student.User.IsActive = active;
        student.UpdatedAt = clock.UtcNow;
        student.User.UpdatedAt = clock.UtcNow;
        audit.Record(actor, active ? "activate_student" : "deactivate_student", "student", student.Id, null);
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Edita los datos de un profesor (nombre y bio).</summary>
    public async Task UpdateTeacherAsync(Guid teacherId, UpdateTeacherInput i, Guid actor, CancellationToken ct = default)
    {
        var teacher = await db.Teachers.Include(t => t.User)
            .FirstOrDefaultAsync(t => t.Id == teacherId, ct)
            ?? throw new InvalidOperationException("Profesor no encontrado.");
        if (string.IsNullOrWhiteSpace(i.FullName))
            throw new InvalidOperationException("El nombre no puede quedar vacío.");

        teacher.User.FullName = i.FullName.Trim();
        teacher.User.UpdatedAt = clock.UtcNow;
        teacher.Bio = string.IsNullOrWhiteSpace(i.Bio) ? null : i.Bio.Trim();
        teacher.UpdatedAt = clock.UtcNow;
        audit.Record(actor, "update_teacher", "teacher", teacher.Id, new { i.FullName });
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Activa o desactiva un profesor (baja lógica; su usuario también se inhabilita).</summary>
    public async Task SetTeacherActiveAsync(Guid teacherId, bool active, Guid actor, CancellationToken ct = default)
    {
        var teacher = await db.Teachers.Include(t => t.User)
            .FirstOrDefaultAsync(t => t.Id == teacherId, ct)
            ?? throw new InvalidOperationException("Profesor no encontrado.");
        teacher.IsActive = active;
        teacher.User.IsActive = active;
        teacher.UpdatedAt = clock.UtcNow;
        teacher.User.UpdatedAt = clock.UtcNow;
        audit.Record(actor, active ? "activate_teacher" : "deactivate_teacher", "teacher", teacher.Id, null);
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Edita una clase (horario/estilo/nivel/profesores). Reemplaza los profesores asignados.</summary>
    public async Task UpdateClassAsync(Guid classId, UpdateClassInput i, Guid actor, CancellationToken ct = default)
    {
        var cls = await db.Classes.Include(c => c.ClassTeachers)
            .FirstOrDefaultAsync(c => c.Id == classId, ct)
            ?? throw new InvalidOperationException("Clase no encontrada.");

        cls.Name = i.Name;
        cls.Style = i.Style;
        cls.Level = i.Level;
        cls.Weekday = i.Weekday;
        cls.StartTime = TimeOnly.Parse(i.StartTime);
        cls.EndTime = TimeOnly.Parse(i.EndTime);
        cls.Room = i.Room;
        cls.UpdatedAt = clock.UtcNow;

        // Reemplazar el set de profesores.
        var wanted = i.TeacherIds.Distinct().ToHashSet();
        foreach (var link in cls.ClassTeachers.Where(l => !wanted.Contains(l.TeacherId)).ToList())
            db.ClassTeachers.Remove(link);
        var existing = cls.ClassTeachers.Select(l => l.TeacherId).ToHashSet();
        foreach (var tId in wanted.Where(t => !existing.Contains(t)))
            db.ClassTeachers.Add(new ClassTeacher { ClassId = cls.Id, TeacherId = tId });

        audit.Record(actor, "update_class", "dance_class", cls.Id, new { i.Name });
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Activa o desactiva una clase (baja lógica; no borra sesiones ya generadas).</summary>
    public async Task SetClassActiveAsync(Guid classId, bool active, Guid actor, CancellationToken ct = default)
    {
        var cls = await db.Classes.FirstOrDefaultAsync(c => c.Id == classId, ct)
            ?? throw new InvalidOperationException("Clase no encontrada.");
        cls.IsActive = active;
        cls.UpdatedAt = clock.UtcNow;
        audit.Record(actor, active ? "activate_class" : "deactivate_class", "dance_class", cls.Id, null);
        await db.SaveChangesAsync(ct);
    }

    /// <summary>
    /// Genera (o reutiliza) las sesiones de HOY para todas las clases activas cuyo día
    /// de la semana coincide. Devuelve cuántas sesiones quedaron disponibles hoy.
    /// </summary>
    public async Task<int> EnsureTodaySessionsAsync(CancellationToken ct = default)
    {
        var today = DateOnly.FromDateTime(clock.UtcNow.AddHours(-3)); // fecha local Montevideo
        var weekday = (short)today.DayOfWeek; // 0=domingo .. 6=sábado
        var classIds = await db.Classes
            .Where(c => c.IsActive && c.Weekday == weekday)
            .Select(c => c.Id)
            .ToListAsync(ct);

        foreach (var id in classIds)
            await EnsureSessionAsync(id, today, ct);

        return classIds.Count;
    }

    /// <summary>Crea (o devuelve) la sesión de una clase en una fecha, calculando la ventana en UTC.</summary>
    public async Task<Guid> EnsureSessionAsync(Guid classId, DateOnly date, CancellationToken ct = default)
    {
        var existing = await db.Sessions
            .FirstOrDefaultAsync(s => s.ClassId == classId && s.SessionDate == date, ct);
        if (existing is not null) return existing.Id;

        var cls = await db.Classes.FirstAsync(c => c.Id == classId, ct);
        // Zona America/Montevideo = UTC-3 (sin DST). Hora local -> UTC = local + 3h.
        var startLocal = date.ToDateTime(cls.StartTime);
        var endLocal = date.ToDateTime(cls.EndTime);
        var session = new ClassSession
        {
            Id = Guid.NewGuid(),
            ClassId = classId,
            SessionDate = date,
            StartAt = DateTime.SpecifyKind(startLocal.AddHours(3), DateTimeKind.Utc),
            EndAt = DateTime.SpecifyKind(endLocal.AddHours(3), DateTimeKind.Utc),
            Status = "scheduled",
            CreatedAt = clock.UtcNow
        };
        db.Sessions.Add(session);
        await db.SaveChangesAsync(ct);
        return session.Id;
    }

    private async Task<AppUser> CreateUserAsync(string fullName, string email, string password,
        string? phone, short roleId, CancellationToken ct)
    {
        email = email.ToLower();
        if (await db.Users.AnyAsync(u => u.Email == email, ct))
            throw new InvalidOperationException($"Ya existe un usuario con el email {email}.");

        var user = new AppUser
        {
            Id = Guid.NewGuid(),
            Email = email, FullName = fullName, Phone = phone,
            PasswordHash = hasher.Hash(password), IsActive = true,
            CreatedAt = clock.UtcNow, UpdatedAt = clock.UtcNow
        };
        db.Users.Add(user);
        db.UserRoles.Add(new UserRole { UserId = user.Id, RoleId = roleId });
        await db.SaveChangesAsync(ct);
        return user;
    }
}
