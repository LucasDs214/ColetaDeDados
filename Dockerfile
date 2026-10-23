# 1. Build do Frontend (React/Vite)
FROM node:20-alpine AS build-frontend
WORKDIR /src/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# 2. Build do Backend (C# .NET 8)
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build-backend
WORKDIR /src/backend
COPY backend/*.csproj ./
RUN dotnet restore
COPY backend/ ./
RUN dotnet publish -c Release -o /app/publish

# 3. Imagem Final (Juntando API e Site)
FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build-backend /app/publish .
# Coloca o site compilado na pasta wwwroot para a API servir
COPY --from=build-frontend /src/frontend/dist ./wwwroot

# Configuração de porta para o Render
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

ENTRYPOINT ["dotnet", "Backend.dll"]
