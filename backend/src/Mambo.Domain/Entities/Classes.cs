namespace Mambo.Domain.Entities;

/// <summary>Plantilla de clase recurrente (semanal).</summary>
public class DanceClass
{
    public Guid Id { get; set; }
    public string Name { get; set; } = default!;
    public string Style { get; set; } = default!;
    public string Level { get; set; } = default!;
    public short Weekday { get; set; }              // 0=domingo .. 6=sábado
    public TimeOnly StartTime { get; set; }
    public TimeOnly EndTime { get; set; }
    public string? Room { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public ICollection<ClassTeacher> ClassTeachers { get; set; } = new List<ClassTeacher>();
    public ICollection<ClassSession> Sessions { get; set; } = new List<ClassSession>();
}

public class ClassTeacher
{
    public Guid ClassId { get; set; }
    public Guid TeacherId { get; set; }
    public DanceClass Class { get; set; } = default!;
    public Teacher Teacher { get; set; } = default!;
}

/// <summary>Instancia concreta de una clase en una fecha. A ella se cuelgan las asistencias.</summary>
public class ClassSession
{
    public Guid Id { get; set; }
    public Guid ClassId { get; set; }
    public DateOnly SessionDate { get; set; }
    public DateTime StartAt { get; set; }           // UTC
    public DateTime EndAt { get; set; }             // UTC
    public string Status { get; set; } = "scheduled"; // scheduled | cancelled | done
    public Guid? SubstituteTeacherId { get; set; }
    public DateTime CreatedAt { get; set; }

    public DanceClass Class { get; set; } = default!;
    public ICollection<Attendance> Attendances { get; set; } = new List<Attendance>();
}
