# =====================================================================
# Backend Mambo.Api — imagen de producción (.NET 8)
# Build multi-stage: SDK para compilar, runtime ASP.NET liviano para correr.
# =====================================================================

# ---- Build ----
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# 1) Copiar sólo los .csproj para cachear el restore entre builds.
COPY src/Mambo.Domain/Mambo.Domain.csproj             src/Mambo.Domain/
COPY src/Mambo.Application/Mambo.Application.csproj    src/Mambo.Application/
COPY src/Mambo.Infrastructure/Mambo.Infrastructure.csproj src/Mambo.Infrastructure/
COPY src/Mambo.Api/Mambo.Api.csproj                   src/Mambo.Api/
RUN dotnet restore src/Mambo.Api/Mambo.Api.csproj

# 2) Copiar el resto del código y publicar en Release.
COPY src/ src/
RUN dotnet publish src/Mambo.Api/Mambo.Api.csproj -c Release -o /app/publish /p:UseAppHost=false

# ---- Runtime ----
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish .

ENV ASPNETCORE_ENVIRONMENT=Production
# Puerto por defecto (Render inyecta PORT y el backend lo respeta desde Program.cs).
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

ENTRYPOINT ["dotnet", "Mambo.Api.dll"]
