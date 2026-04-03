# Lemonade Stand Tycoon

## Project Overview
A browser-based tycoon/idle game where players start with a tiny neighborhood lemonade stand and build a global beverage empire. Built with C# (.NET 8) backend API and React/TypeScript/Vite frontend.

## Tech Stack
- **Backend**: C# / .NET 8 Web API
- **Frontend**: React 18 + TypeScript + Vite
- **Database**: SQLite (dev) / Azure SQL (prod)
- **Hosting**: Azure App Service + Azure Static Web Apps
- **CI/CD**: GitHub Actions
- **Testing**: xUnit (backend), Vitest + Playwright (frontend)

## Project Structure
```
/app
├── CLAUDE.md
├── backend/              # .NET 8 Web API
│   ├── LemonadeStand.Api/
│   ├── LemonadeStand.Core/
│   ├── LemonadeStand.Data/
│   └── LemonadeStand.Tests/
├── frontend/             # React + TypeScript + Vite
│   ├── src/
│   ├── public/
│   └── tests/
├── docs/                 # Game design docs, business model
│   ├── game-design.md
│   ├── business-model.md
│   └── architecture.md
└── infra/                # Azure infrastructure (Bicep/ARM)
```

## Development Commands
- Backend: `cd backend && dotnet run --project LemonadeStand.Api`
- Frontend: `cd frontend && npm run dev`
- Backend tests: `cd backend && dotnet test`
- Frontend tests: `cd frontend && npm test`
- E2E tests: `cd frontend && npx playwright test`

## Azure Deployment
- Subscription: 1a020407-3f63-418b-91be-af42a0a2cfef
- Target domain: lemonadestand.alanmanderson.com (or Azure free subdomain)

## Key Design Principles
- Mobile-first responsive design
- Incremental/idle game mechanics with active play rewards
- Save state server-side with offline progress
- Clean, professional pixel-art inspired UI
- Engaging progression with meaningful choices
