using Mambo.Domain.Rules;

namespace Mambo.Domain.Tests;

public class AttendanceWindowTests
{
    private static readonly DateTime End = new(2026, 6, 28, 20, 0, 0, DateTimeKind.Utc); // fin 20:00

    [Theory]
    [InlineData(19, 44, false)] // 16 min antes del fin -> aún cerrada
    [InlineData(19, 45, true)]  // 15 min antes -> abre (inclusivo)
    [InlineData(20, 0, true)]   // en el fin
    [InlineData(20, 30, true)]  // 30 min después -> cierra (inclusivo)
    [InlineData(20, 31, false)] // 31 min después -> fuera
    public void IsWithin_respeta_los_bordes(int h, int m, bool expected)
    {
        var now = new DateTime(2026, 6, 28, h, m, 0, DateTimeKind.Utc);
        Assert.Equal(expected, AttendanceWindow.IsWithin(End, now));
    }

    [Fact]
    public void Ventana_abre_15_antes_y_cierra_30_despues()
    {
        Assert.Equal(End.AddMinutes(-15), AttendanceWindow.OpenAt(End));
        Assert.Equal(End.AddMinutes(30), AttendanceWindow.CloseAt(End));
    }
}
