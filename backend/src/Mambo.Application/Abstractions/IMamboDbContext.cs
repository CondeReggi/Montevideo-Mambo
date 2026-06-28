using Mambo.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;

namespace Mambo.Application.Abstractions;

/// <summary>Abstracción del contexto de datos para los casos de uso (implementada en Infrastructure).</summary>
public interface IMamboDbContext
{
    DbSet<AppUser> Users { get; }
    DbSet<Role> Roles { get; }
    DbSet<UserRole> UserRoles { get; }
    DbSet<Student> Students { get; }
    DbSet<Teacher> Teachers { get; }
    DbSet<DanceClass> Classes { get; }
    DbSet<ClassTeacher> ClassTeachers { get; }
    DbSet<ClassSession> Sessions { get; }
    DbSet<PassType> PassTypes { get; }
    DbSet<Pass> Passes { get; }
    DbSet<PassLedgerEntry> LedgerEntries { get; }
    DbSet<Attendance> Attendances { get; }
    DbSet<Payment> Payments { get; }
    DbSet<QrToken> QrTokens { get; }
    DbSet<AuditLog> AuditLogs { get; }

    DatabaseFacade Database { get; }
    Task<int> SaveChangesAsync(CancellationToken ct = default);
}
