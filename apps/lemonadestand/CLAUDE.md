# Lemonade Stand Tycoon

## Project Overview
A browser-based tycoon/idle game where players start with a tiny neighborhood lemonade stand and build a global beverage empire. Built with C# (.NET 8) backend API and React/TypeScript/Vite frontend.

## Tech Stack
- **Backend**: C# / .NET 8 Web API (LemonadeStand.Api, LemonadeStand.Core, LemonadeStand.Data)
- **Frontend**: React 19 + TypeScript + Vite 8 + Zustand + Tailwind CSS 4 + Framer Motion + Recharts
- **Database**: SQLite (single file `lemonade.db`, JSON-serialized game state)
- **Hosting**: Azure App Service (B1 plan, Linux, Central US)
- **CI/CD**: GitHub Actions (auto-deploy on push to `master`)
- **Testing**: xUnit (backend), Vitest + Playwright (frontend)

## Project Structure
```
/app
├── .github/workflows/deploy.yml  # CI/CD: auto-deploy on push to master
├── CLAUDE.md
├── backend/
│   ├── LemonadeStand.Api/       # Controllers, DTOs, middleware, Program.cs
│   ├── LemonadeStand.Core/      # Models, Enums, Engine (GameEngine.cs - core simulation)
│   ├── LemonadeStand.Data/      # EF Core context, GameRepository
│   └── LemonadeStand.Tests/     # xUnit tests
├── frontend/
│   ├── src/
│   │   ├── components/          # UI components (CityMap, StandPanel, RecipeEditor, etc.)
│   │   ├── screens/             # MainMenu, GameDashboard, GameOver
│   │   ├── stores/              # Zustand store (gameStore.ts)
│   │   ├── services/            # API client (api.ts)
│   │   ├── types/               # TypeScript types matching backend DTOs
│   │   ├── hooks/               # useGameActions, useMediaQuery
│   │   └── utils/               # format.ts, game-helpers.ts
│   └── tests/                   # Playwright e2e tests (NOT vitest unit tests)
├── docs/                        # game-design.md, business-model.md, architecture.md, product-requirements.md
└── infra/
    └── deploy.sh                # Azure deployment script
```

## Development Commands
- Backend build: `cd backend && PATH="/home/claude/.dotnet:$PATH" dotnet build`
- Backend run: `cd backend && PATH="/home/claude/.dotnet:$PATH" dotnet run --project LemonadeStand.Api`
- Backend tests: `cd backend && PATH="/home/claude/.dotnet:$PATH" dotnet test`
- Frontend dev: `cd frontend && npm run dev`
- Frontend build: `cd frontend && npm run build`
- Frontend type-check: `cd frontend && npx tsc --noEmit`
- **NOTE**: `npm test` runs vitest which incorrectly picks up Playwright e2e tests and fails. This is a pre-existing config issue. Use `npx tsc --noEmit` for validation instead.
- E2E tests: `cd frontend && npx playwright test` (requires running backend + frontend)

## Azure Deployment
- **Subscription**: (set via `SUBSCRIPTION_ID` env var)
- **Resource Group**: rg-lemonadestand (location: eastus)
- **App Service Plan**: plan-lemonadestand (location: centralus, SKU: B1, Linux)
- **Backend**: lemonade.games.alanmanderson.com (custom) → api-lemonadestand.azurewebsites.net (Azure default)
- **Frontend**: lemonade.games.alanmanderson.com (custom) → app-lemonadestand-web.azurewebsites.net (Azure default)
- **Custom domains**: Bound via `az webapp config hostname add` with Azure-managed free SSL (SNI). CNAMEs point to the `.azurewebsites.net` defaults; `asuid.<subdomain>` TXT records verify ownership via the subscription's `customDomainVerificationId`.
- **NOTE**: Resource group is in eastus but resources are in centralus. The deploy script uses centralus.

### Deploy Process
```bash
# Full deploy (infra/deploy.sh handles everything):
bash infra/deploy.sh

# Manual backend deploy:
cd backend
PATH="/home/claude/.dotnet:$PATH" dotnet publish LemonadeStand.Api/LemonadeStand.Api.csproj -c Release -o ./publish
cd publish
python3 -c "import zipfile,os; z=zipfile.ZipFile('/tmp/backend.zip','w',zipfile.ZIP_DEFLATED); [z.write(os.path.join(r,f)) for r,d,fs in os.walk('.') for f in fs]; z.close()"
az webapp deploy --name api-lemonadestand --resource-group rg-lemonadestand --src-path /tmp/backend.zip --type zip

# Manual frontend deploy:
cd frontend
VITE_API_URL="https://lemonade.games.alanmanderson.com" npm run build
# Copy server.js and package.json into dist/, then zip and deploy to app-lemonadestand-web
```

## CI/CD (GitHub Actions)
- **Workflow**: `.github/workflows/deploy.yml` — triggers on push to `master`
- **Jobs**: `test` (xUnit) → `deploy-backend` + `deploy-frontend` (parallel after tests pass)
- **Secrets** (set in GitHub repo settings):
  - `AZURE_BACKEND_PUBLISH_PROFILE` — Azure publish profile XML for `api-lemonadestand`
  - `AZURE_FRONTEND_PUBLISH_PROFILE` — Azure publish profile XML for `app-lemonadestand-web`
- **Manual deploy** still works via `infra/deploy.sh` if needed

## Environment Gotchas
- **dotnet not on PATH**: Use `PATH="/home/claude/.dotnet:$PATH"` prefix or full path `/home/claude/.dotnet/dotnet`
- **No `zip` command**: Use Python: `python3 -c "import zipfile,os; ..."`
- **No `sudo`**: Cannot install packages via apt
- **CI/CD**: GitHub Actions deploys on push to `master`. Manual deploy still available via `infra/deploy.sh`.
- **WebFetch can't test SPA**: Frontend is a React SPA - WebFetch only sees the HTML shell. Verify production by checking HTTP status codes and that JS/CSS assets serve correctly.
- **CORS**: Backend configured to allow frontend origins. If adding new frontend URL, update CORS via `az webapp cors add`.

## Architecture Notes

### Authentication
- **JWT auth** with BCrypt passwords + Google OAuth (ID token validation server-side)
- `AuthController` handles `/api/auth/register`, `/api/auth/login`, `/api/auth/google`, `/api/auth/me`
- `AuthService` generates 30-day JWTs, validates Google tokens via `GoogleJsonWebSignature`
- `GameController` is `[Authorize]` — all game endpoints require a valid JWT
- `GameRepository` methods filter by `userId` for ownership isolation
- Frontend stores JWT in `localStorage`, sends via `Authorization: Bearer` header
- `useAuthStore` (Zustand) manages auth state; `useAuthInit` validates token on mount
- Google OAuth uses `@react-oauth/google` with popup flow
- **Env vars for production**: `Jwt__Secret`, `Google__ClientId` (backend), `VITE_GOOGLE_CLIENT_ID` (frontend build)
- User model: `User.cs` in Core, `UserEntity` + `UserRepository` in Data layer

### Backend
- **GameEngine.cs** is the core - contains ALL game simulation logic as static methods
- **GameState** is the root entity; entire state serialized as JSON in SQLite
- **No migrations** - DB created via `EnsureCreatedAsync()` on startup
- All game mutations happen server-side; frontend calls API then refreshes state

### Frontend
- **Zustand store** holds game state + UI state (toasts, day results)
- **api.ts** is the single API client; all endpoints return typed responses
- **CityMap** component is the main map view (replaced old stand list + LocationPicker)
- **GameDashboard** is the primary play screen (3-column layout: map+inventory | stand details | financials+employees+achievements)

### Game Mechanics
- 10 progression stages unlocked by total revenue ($100 to $100,000)
- Weather system with seasons (120-day cycle), 9 weather types
- City events: location-specific traffic multipliers (12% daily chance)
- Global events: festivals, competitors, supply shortages, etc. (5% + 1%/stand daily chance)
- Competition: players fight back with quality (>60) + price (<$2.50) to weaken/defeat competitors
- Recipe quality scored 0-100 based on ingredient ratios + weather conditions
- Build costs for new stands (one-time) + daily rent (recurring)
- Bankruptcy: cash < -$10 with no inventory remaining

### Backward Compatibility
- New fields on models MUST have default values (empty lists, 0, 1.0, etc.)
- JSON deserialization of existing saves must not break
- Frontend should use `?? []` or `?? default` for new optional fields from API

## Key Design Principles
- Mobile-first responsive design
- Incremental/idle game mechanics with active play rewards
- Save state server-side with offline progress
- Clean, professional pixel-art inspired UI
- Engaging progression with meaningful choices
