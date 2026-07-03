using Mambo.Application.Abstractions;
using Mambo.Domain;
using Mambo.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Mambo.Infrastructure.Persistence;

public class MamboDbContext(DbContextOptions<MamboDbContext> options) : DbContext(options), IMamboDbContext
{
    public DbSet<AppUser> Users => Set<AppUser>();
    public DbSet<Role> Roles => Set<Role>();
    public DbSet<UserRole> UserRoles => Set<UserRole>();
    public DbSet<Student> Students => Set<Student>();
    public DbSet<Teacher> Teachers => Set<Teacher>();
    public DbSet<DanceClass> Classes => Set<DanceClass>();
    public DbSet<ClassTeacher> ClassTeachers => Set<ClassTeacher>();
    public DbSet<ClassSession> Sessions => Set<ClassSession>();
    public DbSet<PassType> PassTypes => Set<PassType>();
    public DbSet<Pass> Passes => Set<Pass>();
    public DbSet<PassLedgerEntry> LedgerEntries => Set<PassLedgerEntry>();
    public DbSet<Attendance> Attendances => Set<Attendance>();
    public DbSet<Payment> Payments => Set<Payment>();
    public DbSet<QrToken> QrTokens => Set<QrToken>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        // Mapear enums de PostgreSQL (deben coincidir con los CREATE TYPE de 001).
        // Solo aplica con Npgsql; en SQLite (dev sin Docker) los enums se guardan como int.
        if (Database.IsNpgsql())
        {
            b.HasPostgresEnum<AppRole>("app_role");
            b.HasPostgresEnum<AttendanceStatus>("attendance_status");
            b.HasPostgresEnum<AttendanceSource>("attendance_source");
            b.HasPostgresEnum<PassKind>("pass_kind");
            b.HasPostgresEnum<PassStatus>("pass_status");
            b.HasPostgresEnum<PaymentStatus>("payment_status");
            b.HasPostgresEnum<LedgerReason>("ledger_reason");
        }

        b.Entity<AppUser>(e =>
        {
            e.ToTable("app_user");
            e.HasKey(x => x.Id);
            e.Property(x => x.PasswordHash).HasColumnName("password_hash");
            e.HasMany(x => x.UserRoles).WithOne(x => x.User).HasForeignKey(x => x.UserId);
        });

        b.Entity<Role>(e =>
        {
            e.ToTable("role");
            e.HasKey(x => x.Id);
            e.Property(x => x.Code).HasColumnType("app_role");
        });

        b.Entity<UserRole>(e =>
        {
            e.ToTable("user_role");
            e.HasKey(x => new { x.UserId, x.RoleId });
            e.HasOne(x => x.Role).WithMany().HasForeignKey(x => x.RoleId);
        });

        b.Entity<Student>(e =>
        {
            e.ToTable("student");
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.UserId).IsUnique();
            e.HasIndex(x => x.QrFixedCode).IsUnique();
            e.HasOne(x => x.User).WithOne(x => x.Student).HasForeignKey<Student>(x => x.UserId);
        });

        b.Entity<Teacher>(e =>
        {
            e.ToTable("teacher");
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.UserId).IsUnique();
            e.HasOne(x => x.User).WithOne(x => x.Teacher).HasForeignKey<Teacher>(x => x.UserId);
        });

        b.Entity<DanceClass>(e =>
        {
            e.ToTable("dance_class");
            e.HasKey(x => x.Id);
        });

        b.Entity<ClassTeacher>(e =>
        {
            e.ToTable("class_teacher");
            e.HasKey(x => new { x.ClassId, x.TeacherId });
            e.HasOne(x => x.Class).WithMany(x => x.ClassTeachers).HasForeignKey(x => x.ClassId);
            e.HasOne(x => x.Teacher).WithMany(x => x.ClassTeachers).HasForeignKey(x => x.TeacherId);
        });

        b.Entity<ClassSession>(e =>
        {
            e.ToTable("class_session");
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.ClassId, x.SessionDate }).IsUnique();
            e.HasIndex(x => x.EndAt);
            e.HasOne(x => x.Class).WithMany(x => x.Sessions).HasForeignKey(x => x.ClassId);
        });

        b.Entity<PassType>(e =>
        {
            e.ToTable("pass_type");
            e.HasKey(x => x.Id);
            e.Property(x => x.Kind).HasColumnType("pass_kind");
            e.Property(x => x.Price).HasColumnType("numeric(10,2)");
        });

        b.Entity<Pass>(e =>
        {
            e.ToTable("pass");
            e.HasKey(x => x.Id);
            e.Property(x => x.Kind).HasColumnType("pass_kind");
            e.Property(x => x.Status).HasColumnType("pass_status");
            e.HasIndex(x => new { x.StudentId, x.Status });
            e.HasIndex(x => x.ValidTo);
            e.HasOne(x => x.Student).WithMany(x => x.Passes).HasForeignKey(x => x.StudentId);
            e.HasOne(x => x.PassType).WithMany().HasForeignKey(x => x.PassTypeId);
        });

        b.Entity<PassLedgerEntry>(e =>
        {
            e.ToTable("pass_ledger_entry");
            e.HasKey(x => x.Id);
            e.Property(x => x.Reason).HasColumnType("ledger_reason");
            e.HasIndex(x => x.PassId);
            e.HasOne(x => x.Pass).WithMany(x => x.Ledger).HasForeignKey(x => x.PassId);
        });

        b.Entity<Attendance>(e =>
        {
            e.ToTable("attendance");
            e.HasKey(x => x.Id);
            e.Property(x => x.Status).HasColumnType("attendance_status");
            e.Property(x => x.Source).HasColumnType("attendance_source");
            e.HasIndex(x => new { x.StudentId, x.ClassSessionId }).IsUnique();
            e.HasIndex(x => new { x.ClassSessionId, x.Status });
            e.HasOne(x => x.Student).WithMany(x => x.Attendances).HasForeignKey(x => x.StudentId);
            e.HasOne(x => x.Session).WithMany(x => x.Attendances).HasForeignKey(x => x.ClassSessionId);
        });

        b.Entity<Payment>(e =>
        {
            e.ToTable("payment");
            e.HasKey(x => x.Id);
            e.Property(x => x.Status).HasColumnType("payment_status");
            e.Property(x => x.Amount).HasColumnType("numeric(10,2)");
            e.HasIndex(x => new { x.StudentId, x.Status });
            e.HasOne(x => x.Student).WithMany(x => x.Payments).HasForeignKey(x => x.StudentId);
        });

        b.Entity<QrToken>(e =>
        {
            e.ToTable("qr_token");
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.Token).IsUnique();
            e.HasIndex(x => x.ExpiresAt);
        });

        b.Entity<AuditLog>(e =>
        {
            e.ToTable("audit_log");
            e.HasKey(x => x.Id);
            e.Property(x => x.Detail).HasColumnType("jsonb");
        });

        base.OnModelCreating(b);
    }
}
