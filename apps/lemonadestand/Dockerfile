# ---------------------------------------------------------------------------
# Stage 1: Build the frontend (Vite)
# ---------------------------------------------------------------------------
FROM node:20-alpine AS frontend-build

WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 2: Build the .NET backend
# ---------------------------------------------------------------------------
FROM mcr.microsoft.com/dotnet/sdk:8.0-alpine AS backend-build

WORKDIR /build
COPY backend/LemonadeStand.sln ./
COPY backend/LemonadeStand.Api/LemonadeStand.Api.csproj ./LemonadeStand.Api/
COPY backend/LemonadeStand.Core/LemonadeStand.Core.csproj ./LemonadeStand.Core/
COPY backend/LemonadeStand.Data/LemonadeStand.Data.csproj ./LemonadeStand.Data/
RUN dotnet restore LemonadeStand.Api/LemonadeStand.Api.csproj

COPY backend/LemonadeStand.Api/ ./LemonadeStand.Api/
COPY backend/LemonadeStand.Core/ ./LemonadeStand.Core/
COPY backend/LemonadeStand.Data/ ./LemonadeStand.Data/
RUN dotnet publish LemonadeStand.Api/LemonadeStand.Api.csproj -c Release -o /publish --no-restore

# ---------------------------------------------------------------------------
# Stage 3: Production image
# ---------------------------------------------------------------------------
FROM mcr.microsoft.com/dotnet/aspnet:8.0-alpine AS production

RUN addgroup -S app && adduser -S app -G app

WORKDIR /app

COPY --from=backend-build /publish ./

# Copy built frontend into wwwroot so ASP.NET serves it
COPY --from=frontend-build /build/dist ./wwwroot/

RUN chown -R app:app /app

ENV ASPNETCORE_URLS=http://+:5000
ENV ASPNETCORE_ENVIRONMENT=Production

EXPOSE 5000

USER app

CMD ["dotnet", "LemonadeStand.Api.dll"]
