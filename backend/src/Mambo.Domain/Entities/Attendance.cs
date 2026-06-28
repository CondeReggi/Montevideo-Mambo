namespace Mambo.Domain.Entities;

/// <summary>Registro de asistencia de un alumno a una sesión de clase.</summary>
public class Attendance
{
    public Guid Id { get; set; }
    public Guid StudentId { get; set; }
    public Guid ClassSessionId { get; set; }
    public AttendanceStatus Status { get; set; } = AttendanceStatus.Pending;
    public AttendanceSource Source { get; set; }
    public DateTime CheckedInAt { get; set; }
    public DateTime? ConfirmedAt { get; set; }
    public Guid? ConfirmedBy { get; set; }
    public Guid? PassId { get; set; }               // cuponera consumida (null si pase libre o deuda)
    public bool CoveredByUnlimited { get; set; }
    public string? CorrectionReason { get; set; }
    public bool IsAmbiguous { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public Student Student { get; set; } = default!;
    public ClassSession Session { get; set; } = default!;
}
