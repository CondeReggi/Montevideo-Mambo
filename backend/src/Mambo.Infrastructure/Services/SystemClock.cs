using Mambo.Application.Abstractions;

namespace Mambo.Infrastructure.Services;

public class SystemClock : IClock
{
    public DateTime UtcNow => DateTime.UtcNow;
}
