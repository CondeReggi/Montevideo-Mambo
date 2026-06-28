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
