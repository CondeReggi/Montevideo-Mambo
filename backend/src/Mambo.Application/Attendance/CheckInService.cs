using Mambo.Application.Abstractions;
using Mambo.Domain;
using Mambo.Domain.Entities;
using Mambo.Domain.Rules;
using Microsoft.EntityFrameworkCore;

namespace Mambo.Application.UseCases;

public record CheckInResult(Guid AttendanceId, Guid StudentId, AttendanceStatus Status, bool IsAmbiguous,
                            bool OutOfWindow, bool AlreadyExisted, string Message);

/// <summary>
/// Registra un check-in (modo primario: la academia escanea el QR del alumno).
/// Detecta la sesión por ventana horaria, evita duplicados y crea una asistencia Pendiente.
/// NUNCA descuenta saldo aquí: el descuento ocurre solo al confirmar.
/// </summary>
public class CheckInService(IMamboDbContext db, IClock clock)
{
    /// <summary>Check-in identificando al alumno por su código de QR fijo.</summary>
    public async Task<CheckInResult> RegisterByQrCodeAsync(string qrFixedCode, AttendanceSource source, CancellationToken ct = default)
    {
        var student = await db.Students.FirstOrDefaultAsync(s => s.QrFixedCode == qrFixedCode && s.IsActive, ct)
            ?? throw new InvalidOperationException("Alumno no encontrado o inactivo para ese QR.");
        return await RegisterAsync(student.Id, source, ct);
    }

    /// <summary>Ventana en la que una sesión es "activa"/escaneable: [inicio, fin + 30min].</summary>
    public static bool IsSessionScannable(DateTime startUtc, DateTime endUtc, DateTime nowUtc) =>
        nowUtc >= startUtc && nowUtc <= endUtc + Mambo.Domain.Rules.AttendanceWindow.ClosesAfterEnd;

    /// <summary>
    /// Check-in sobre una sesión EXPLÍCITA (Modo B: el alumno escaneó el QR de esa clase).
    /// Valida que la sesión esté activa, evita duplicados y crea una asistencia Pendiente.
    /// </summary>
    public async Task<CheckInResult> RegisterForSessionAsync(Guid studentId, Guid sessionId,
        AttendanceSource source, CancellationToken ct = default)
    {
        var now = clock.UtcNow;

        if (!await db.Students.AnyAsync(s => s.Id == studentId && s.IsActive, ct))
            throw new InvalidOperationException("Alumno no encontrado o inactivo.");

        var session = await db.Sessions.FirstOrDefaultAsync(s => s.Id == sessionId, ct)
            ?? throw new InvalidOperationException("La clase no existe.");
        if (session.Status == "cancelled")
            throw new InvalidOperationException("La clase fue cancelada.");
        if (!IsSessionScannable(session.StartAt, session.EndAt, now))
            throw new InvalidOperationException("La clase no está activa en este momento.");

        var existing = await db.Attendances
            .FirstOrDefaultAsync(a => a.StudentId == studentId && a.ClassSessionId == sessionId, ct);
        if (existing is not null)
            return new CheckInResult(existing.Id, studentId, existing.Status, existing.IsAmbiguous,
                false, true, "Ya habías marcado asistencia a esta clase.");

        var attendance = new Attendance
        {
            Id = Guid.NewGuid(),
            StudentId = studentId,
            ClassSessionId = sessionId,
            Status = AttendanceStatus.Pending,
            Source = source,
            CheckedInAt = now,
            IsAmbiguous = false,
            CreatedAt = now,
            UpdatedAt = now
        };
        db.Attendances.Add(attendance);
        await db.SaveChangesAsync(ct);
        return new CheckInResult(attendance.Id, studentId, attendance.Status, false, false, false,
            "Asistencia registrada como pendiente.");
    }

    /// <summary>Check-in por id de alumno.</summary>
    public async Task<CheckInResult> RegisterAsync(Guid studentId, AttendanceSource source, CancellationToken ct = default)
    {
        var now = clock.UtcNow;
        var today = DateOnly.FromDateTime(now);

        // Sesiones de hoy no canceladas (la grilla del día).
        var sessions = await db.Sessions
            .Where(s => s.SessionDate == today && s.Status != "cancelled")
            .ToListAsync(ct);

        if (sessions.Count == 0)
            throw new InvalidOperationException("No hay sesiones de clase hoy para registrar asistencia.");

        // Candidatas: aquellas cuya ventana [fin-15, fin+30] contiene 'ahora'.
        var inWindow = sessions.Where(s => AttendanceWindow.IsWithin(s.EndAt, now)).ToList();

        ClassSession target;
        bool outOfWindow = false;
        bool ambiguous = false;
        var resolvedSource = source;

        if (inWindow.Count == 1)
        {
            target = inWindow[0];
        }
        else if (inWindow.Count > 1)
        {
            // Defensivo: con una sola sede no debería pasar (no-solape). Se marca para revisión.
            target = inWindow.OrderBy(s => Math.Abs((s.EndAt - now).Ticks)).First();
            ambiguous = true;
        }
        else
        {
            // Fuera de ventana: queda pendiente manual sobre la sesión más cercana del día (regla R2).
            target = sessions.OrderBy(s => Math.Abs((s.EndAt - now).Ticks)).First();
            outOfWindow = true;
            resolvedSource = AttendanceSource.OutOfWindowManual;
        }

        // Anti-duplicado (regla R3): un registro por (alumno, sesión). Idempotente.
        var existing = await db.Attendances
            .FirstOrDefaultAsync(a => a.StudentId == studentId && a.ClassSessionId == target.Id, ct);
        if (existing is not null)
            return new CheckInResult(existing.Id, studentId, existing.Status, existing.IsAmbiguous,
                outOfWindow, true, "Ya existía un registro para esta clase.");

        var attendance = new Attendance
        {
            Id = Guid.NewGuid(),
            StudentId = studentId,
            ClassSessionId = target.Id,
            Status = AttendanceStatus.Pending,
            Source = resolvedSource,
            CheckedInAt = now,
            IsAmbiguous = ambiguous,
            CreatedAt = now,
            UpdatedAt = now
        };
        db.Attendances.Add(attendance);
        await db.SaveChangesAsync(ct);

        var msg = outOfWindow ? "Registrado fuera de ventana: pendiente de revisión."
                : ambiguous ? "Registrado, pero la clase es ambigua: requiere revisión."
                : "Asistencia registrada como pendiente.";
        return new CheckInResult(attendance.Id, studentId, attendance.Status, ambiguous, outOfWindow, false, msg);
    }
}
