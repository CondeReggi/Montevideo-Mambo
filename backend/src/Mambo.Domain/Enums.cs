namespace Mambo.Domain;

/// <summary>Roles de negocio del sistema.</summary>
public enum AppRole { Admin = 1, Teacher = 2, Student = 3 }

/// <summary>Estados de una asistencia. El descuento ocurre solo al pasar a Confirmed.</summary>
public enum AttendanceStatus { Pending, Confirmed, Rejected, Corrected }

/// <summary>Origen del registro de asistencia.</summary>
public enum AttendanceSource { QrStudent, QrAcademy, ManualAdmin, OutOfWindowManual }

/// <summary>Tipo de cuponera.</summary>
public enum PassKind { ClassPack, UnlimitedMonth, SingleClass }

/// <summary>Estado de una cuponera.</summary>
public enum PassStatus { Active, Expired, Exhausted, Cancelled }

/// <summary>Estado de un pago manual.</summary>
public enum PaymentStatus { Pending, Confirmed, Cancelled }

/// <summary>Razón de un movimiento del ledger de cuponera.</summary>
public enum LedgerReason { Consume, PurchaseCredit, ManualAdjust, Extension, CorrectionReverse }
