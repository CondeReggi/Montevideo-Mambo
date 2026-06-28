namespace Mambo.Domain.Entities;

public class Student
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string? DocumentId { get; set; }
    public DateOnly? BirthDate { get; set; }
    public string? PhotoPath { get; set; }          // ruta en Supabase Storage
    public string QrFixedCode { get; set; } = default!;
    public string? EmergencyContact { get; set; }
    public string? Notes { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public AppUser User { get; set; } = default!;
    public ICollection<Pass> Passes { get; set; } = new List<Pass>();
    public ICollection<Attendance> Attendances { get; set; } = new List<Attendance>();
    public ICollection<Payment> Payments { get; set; } = new List<Payment>();
}

public class Teacher
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string? Bio { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public AppUser User { get; set; } = default!;
    public ICollection<ClassTeacher> ClassTeachers { get; set; } = new List<ClassTeacher>();
}
