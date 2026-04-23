# Deployment Guide: Telestrations on Azure

**Target URL:** tele.alanmanderson.com
**Stack:** Node.js 20, Express + Socket.IO, served from Azure App Service B1 (Linux)

This guide covers everything from a fresh Azure account to a working deployment with a custom domain and SSL. Follow the sections in order the first time. After that, every push to `main` deploys automatically via GitHub Actions.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Azure Resource Setup](#2-azure-resource-setup)
3. [Custom Domain and SSL](#3-custom-domain-and-ssl)
4. [GitHub Repository Setup](#4-github-repository-setup)
5. [First Deployment](#5-first-deployment)
6. [Local Development Setup](#6-local-development-setup)
7. [Cost Breakdown](#7-cost-breakdown)
8. [Monitoring and Troubleshooting](#8-monitoring-and-troubleshooting)
9. [Alternative: Docker Deployment](#9-alternative-docker-deployment)
10. [Maintenance Checklist](#10-maintenance-checklist)

---

## 1. Prerequisites

| Requirement | Notes |
|---|---|
| Azure account | [portal.azure.com](https://portal.azure.com). Free to create. |
| GitHub account | Repo must be on GitHub for the CI/CD workflow. |
| Domain | alanmanderson.com is already owned. You'll add a subdomain. |
| Azure CLI | Install from [aka.ms/installazurecli](https://aka.ms/installazurecli) |
| Node.js 20 | For local development only. Not needed for deployment. |

**Log into the Azure CLI before running any `az` commands:**

```bash
az login
```

Verify you're pointed at the right subscription:

```bash
az account show
```

If you have multiple subscriptions, set the one you want to use:

```bash
az account set --subscription "Your Subscription Name"
```

---

## 2. Azure Resource Setup

Everything deploys into a single resource group. Run these commands in order.

### 2.1 Create a Resource Group

```bash
az group create \
  --name rg-telestrations \
  --location eastus
```

Pick a location close to your users. `eastus` is fine for a US audience.

### 2.2 Create an App Service Plan

The B1 tier (Linux) is the cheapest tier that supports WebSockets, which Socket.IO requires. The Free tier (F1) does not support WebSockets.

```bash
az appservice plan create \
  --name plan-telestrations \
  --resource-group rg-telestrations \
  --sku B1 \
  --is-linux
```

### 2.3 Create the App Service

```bash
az webapp create \
  --name telestrations-app \
  --resource-group rg-telestrations \
  --plan plan-telestrations \
  --runtime "NODE:20-lts"
```

The app name `telestrations-app` must be globally unique across all Azure customers. If it's taken, choose something like `telestrations-alan` or any other available name. The name determines your default URL: `telestrations-app.azurewebsites.net`. This is what you'll point the CNAME at.

Verify it was created:

```bash
az webapp show \
  --name telestrations-app \
  --resource-group rg-telestrations \
  --query "defaultHostName" \
  --output tsv
```

### 2.4 Enable WebSockets

This is not on by default and the game will not function without it.

```bash
az webapp config set \
  --name telestrations-app \
  --resource-group rg-telestrations \
  --web-sockets-enabled true
```

### 2.5 Enable Always On

Without Always On, Azure unloads the app after a period of inactivity. Since all game state is in memory, an unload destroys any active games. Always On keeps the process running.

```bash
az webapp config set \
  --name telestrations-app \
  --resource-group rg-telestrations \
  --always-on true
```

### 2.6 Set Environment Variables

```bash
az webapp config appsettings set \
  --name telestrations-app \
  --resource-group rg-telestrations \
  --settings \
    NODE_ENV=production \
    ALLOWED_ORIGIN=https://tele.alanmanderson.com \
    LOG_LEVEL=info
```

Note: `PORT` is set automatically by Azure. Do not set it manually.

`ALLOWED_ORIGIN` controls the CORS header. Set it to the domain players will actually use. Before the custom domain is configured, you can temporarily set it to `https://telestrations-app.azurewebsites.net`.

### 2.7 Set the Startup Command

The deploy workflow places the compiled server at `server/dist/index.js` inside the deploy package. Tell Azure how to start it:

```bash
az webapp config set \
  --name telestrations-app \
  --resource-group rg-telestrations \
  --startup-file "node server/dist/index.js"
```

### 2.8 Verify the App Service is Running

After the first deployment (section 5), you can hit the health endpoint to confirm the app is up:

```bash
curl https://telestrations-app.azurewebsites.net/api/health
```

Expected response:

```json
{"status":"ok","uptime":42,"activeGames":0,"activePlayers":0,"memoryUsageMB":85}
```

---

## 3. Custom Domain and SSL

### 3.1 Add the CNAME Record in Your DNS

In your DNS provider for alanmanderson.com, add a CNAME record:

| Type | Host | Value | TTL |
|---|---|---|---|
| CNAME | tele | telestrations-app.azurewebsites.net | 3600 |

This routes `tele.alanmanderson.com` to your App Service. DNS propagation can take up to 48 hours but is usually done within 15 minutes.

Verify propagation before proceeding:

```bash
dig tele.alanmanderson.com CNAME +short
# Should return: telestrations-app.azurewebsites.net.
```

### 3.2 Add the Custom Domain to Azure

```bash
az webapp config hostname add \
  --webapp-name telestrations-app \
  --resource-group rg-telestrations \
  --hostname tele.alanmanderson.com
```

If this returns a validation error, wait a few more minutes for DNS propagation and retry.

### 3.3 Enable a Free Managed SSL Certificate

Azure provides free SSL certificates for custom domains on B1 and above.

```bash
az webapp config ssl create \
  --name telestrations-app \
  --resource-group rg-telestrations \
  --hostname tele.alanmanderson.com
```

This creates and binds the certificate. It may take 2-5 minutes. Azure auto-renews it.

### 3.4 Force HTTPS

Redirect all HTTP traffic to HTTPS:

```bash
az webapp update \
  --name telestrations-app \
  --resource-group rg-telestrations \
  --https-only true
```

### 3.5 Update ALLOWED_ORIGIN

Once the custom domain is working, update the CORS setting if you set it to the `.azurewebsites.net` URL earlier:

```bash
az webapp config appsettings set \
  --name telestrations-app \
  --resource-group rg-telestrations \
  --settings ALLOWED_ORIGIN=https://tele.alanmanderson.com
```

---

## 4. GitHub Repository Setup

### 4.1 Initialize and Push the Repo

From the project root (`/app` or wherever you have it locally):

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/yourusername/telestrations.git
git push -u origin main
```

### 4.2 Get the Publish Profile from Azure

The publish profile is a credential file Azure uses to authenticate deployments. Download it:

```bash
az webapp deployment list-publishing-profiles \
  --name telestrations-app \
  --resource-group rg-telestrations \
  --xml \
  --output tsv
```

This outputs XML to your terminal. Copy the entire output (from `<publishData>` to `</publishData>`).

Alternatively, download it as a file:

```bash
az webapp deployment list-publishing-profiles \
  --name telestrations-app \
  --resource-group rg-telestrations \
  --xml > publish-profile.xml
```

Open the file and copy all of its contents.

### 4.3 Add the Secret to GitHub

1. Go to your GitHub repository.
2. Navigate to **Settings** > **Secrets and variables** > **Actions**.
3. Click **New repository secret**.
4. Name: `AZURE_WEBAPP_PUBLISH_PROFILE`
5. Value: paste the entire XML content you copied.
6. Click **Add secret**.

The deploy workflow (`deploy.yml`) references this secret as `${{ secrets.AZURE_WEBAPP_PUBLISH_PROFILE }}`.

### 4.4 How the CI/CD Pipelines Work

**CI pipeline** (`.github/workflows/ci.yml`) — runs on every push to every branch and on pull requests targeting `main`:

- Runs three parallel jobs: **Lint & Typecheck**, **Test**, and **Build**.
- Lint & Typecheck: runs `tsc --noEmit` on both server and client.
- Test: runs `vitest run` in the `server/` directory.
- Build: compiles both server (`tsc`) and client (`vite build`) and verifies the output files exist.
- CI does not deploy. It gates the deploy pipeline by failing fast on broken code.

**Deploy pipeline** (`.github/workflows/deploy.yml`) — runs only on pushes to `main` or `master`:

1. Installs dependencies for both `server/` and `client/` with `npm ci`.
2. Builds the client with `vite build` (output: `client/dist/`).
3. Builds the server with `tsc` (output: `server/dist/`).
4. Prunes server `devDependencies` to reduce artifact size.
5. Assembles a `deploy/` directory with the layout:
   ```
   deploy/
   ├── web.config              (from server/web.config)
   ├── server/
   │   ├── dist/               (compiled TypeScript)
   │   ├── node_modules/       (production deps only)
   │   └── package.json
   └── client/
       └── dist/               (Vite build output)
   ```
6. Deploys the `deploy/` directory to Azure App Service using the publish profile.
7. Sets the startup command to `node server/dist/index.js`.

The `web.config` at the deploy root configures IIS/iisnode to route all traffic (including `socket.io` paths) to the Node.js process and enables WebSocket support at the IIS layer.

The concurrency setting in `deploy.yml` (`cancel-in-progress: false`) ensures deploys are never cancelled mid-flight. If two pushes land close together, the second deploy queues rather than cancelling the first.

---

## 5. First Deployment

### 5.1 Push to Main

If the repo is already set up (section 4.1), push any commit to `main`:

```bash
git push origin main
```

### 5.2 Watch the Deployment

1. Go to your GitHub repository.
2. Click the **Actions** tab.
3. You'll see two workflow runs: **CI** and **Deploy to Azure App Service**.
4. Click into the deploy run to see each step. The full run takes roughly 3-4 minutes.

### 5.3 Verify It Worked

Once the deploy step shows green:

```bash
# Hit the health endpoint
curl https://tele.alanmanderson.com/api/health

# Should return:
# {"status":"ok","uptime":...,"activeGames":0,"activePlayers":0,"memoryUsageMB":...}
```

Open `https://tele.alanmanderson.com` in a browser. You should see the landing page with "Create Game" and "Join Game" buttons.

Test WebSocket connectivity by creating a game and checking that the lobby updates in real time when a second browser tab joins with the same game code.

### 5.4 If the Deployment Fails

**Check GitHub Actions logs first.** The most common failures are:

- Build errors in CI (TypeScript errors, test failures) — fix the code and push again.
- `AZURE_WEBAPP_PUBLISH_PROFILE` secret missing or malformed — re-download the publish profile and re-add the secret.
- App Service name mismatch — confirm the `AZURE_WEBAPP_NAME` env var in `deploy.yml` matches the actual app name you created.

**If the build succeeds but the app doesn't start**, check App Service logs (see section 8.1).

---

## 6. Local Development Setup

### 6.1 Clone and Install

```bash
git clone https://github.com/yourusername/telestrations.git
cd telestrations
npm run install:all
```

`install:all` runs `npm ci` in both `server/` and `client/` directories.

### 6.2 Configure Environment Variables

```bash
cp server/.env.example server/.env
```

The defaults in `.env.example` work for local development:

```
PORT=8080
NODE_ENV=development
ALLOWED_ORIGIN=*
LOG_LEVEL=info
```

No changes needed unless you want to test with a different port.

### 6.3 Start the Development Servers

```bash
npm run dev
```

This uses `concurrently` to run both the server and client dev servers simultaneously. The server starts with `tsx watch` (hot-reload on TypeScript changes) and the client starts with Vite's dev server.

By default:
- Server: `http://localhost:8080`
- Client: Vite's dev server (check the terminal output for the exact port, typically `http://localhost:5173`)

Open the Vite URL in your browser. The client proxies API and WebSocket requests to the server.

### 6.4 Run Tests Locally

Run all server tests once:

```bash
npm test
```

Run tests in watch mode (re-runs on file changes):

```bash
npm --prefix server run test:watch
```

Run TypeScript type-checking without emitting files:

```bash
npm run typecheck
```

---

## 7. Cost Breakdown

| Resource | Cost |
|---|---|
| App Service Plan B1 (Linux) | ~$13/month |
| Custom domain (CNAME to azurewebsites.net) | Free |
| Azure Managed SSL Certificate | Free |
| Bandwidth (estimated: a few GB/month at hobby scale) | Negligible (first 5GB/month outbound is free) |
| **Total** | **~$13/month** |

### Cost-Saving Options

**Use the Free tier (F1) to pay $0/month** — with two important caveats:

1. F1 does not support WebSockets. Socket.IO will fall back to HTTP long-polling, which works but is noticeably slower and breaks the real-time feel of the lobby and round transitions.
2. F1 does not support Always On. The app will be unloaded after ~20 minutes of inactivity, losing all in-memory game state.

For occasional use among friends where you start the app before game night, F1 with long-polling might be acceptable. For anything that needs to "just work," stay on B1.

**Stop the app when not in use:**

```bash
az webapp stop --name telestrations-app --resource-group rg-telestrations
```

A stopped app on B1 still incurs the App Service Plan cost. The plan charges by the hour whether the app is running or not. To eliminate the cost entirely, delete the plan and recreate it before the next game night. This is impractical for frequent use.

**If the only goal is $0 cost:** use F1 and accept long-polling. The game still functions.

---

## 8. Monitoring and Troubleshooting

### 8.1 View Live Logs

Stream logs to your terminal in real time:

```bash
az webapp log tail \
  --name telestrations-app \
  --resource-group rg-telestrations
```

If the app hasn't produced logs recently, trigger some activity (e.g., load the page) to see output.

To download recent logs as a zip:

```bash
az webapp log download \
  --name telestrations-app \
  --resource-group rg-telestrations \
  --log-file logs.zip
```

### 8.2 Enable Application Logging (If Not Already On)

```bash
az webapp log config \
  --name telestrations-app \
  --resource-group rg-telestrations \
  --application-logging filesystem \
  --level information
```

### 8.3 Common Issues

**WebSocket connections are not working / Socket.IO falls back to polling**

- Confirm WebSockets are enabled: run the `az webapp config set --web-sockets-enabled true` command from section 2.4 again and verify it succeeds.
- Check that `web.config` is present at the deploy root. The `deploy.yml` workflow copies it from `server/web.config`. If it's missing, WebSocket routing to iisnode won't be configured.
- Confirm the browser is connecting via `wss://` (not `ws://`). The HTTPS-only setting from section 3.4 should handle this.

**App not starting / 502 Bad Gateway**

Check the startup logs immediately:

```bash
az webapp log tail --name telestrations-app --resource-group rg-telestrations
```

Common causes:
- Startup command is wrong. Confirm it's set to `node server/dist/index.js` (section 2.7). The path is relative to the deploy root.
- `server/dist/index.js` is missing from the deploy package. Check the GitHub Actions deploy step — the build verification step in CI will catch a missing build artifact.
- Node version mismatch. Confirm the App Service runtime is `NODE:20-lts` (section 2.3).

**CORS errors in the browser**

The `ALLOWED_ORIGIN` setting must match the exact origin the browser sends. Check:

```bash
az webapp config appsettings list \
  --name telestrations-app \
  --resource-group rg-telestrations \
  --query "[?name=='ALLOWED_ORIGIN']"
```

If the value is `*` in production, Socket.IO connections may behave unexpectedly. Set it to the specific domain: `https://tele.alanmanderson.com`.

**App restarts / game state lost unexpectedly**

Always On (section 2.5) prevents idle-triggered restarts. Azure may still restart the app for platform maintenance or during deployments. Because all state is in memory, any restart drops active games. There is no mitigation for this in v1 — it's an accepted limitation. Players see "Server is restarting. Your game state may be lost." and are returned to the landing page.

**Custom domain shows "site not found" or certificate errors**

- Confirm the CNAME record is set and propagated (`dig tele.alanmanderson.com CNAME +short`).
- Confirm the hostname was added to Azure (section 3.2).
- Confirm the SSL certificate was created and bound (section 3.3). Check the binding:

```bash
az webapp config ssl list --resource-group rg-telestrations --query "[?name=='tele.alanmanderson.com']"
```

**Rate limiting responses (429)**

The server applies rate limits per IP:
- Game creation: 5 per IP per hour
- Join attempts: 20 per IP per minute

If you're hitting 429s during testing, wait for the window to reset or test from a different IP. These limits are hardcoded in `server/src/config.ts` and cannot be changed via environment variables.

---

## 9. Alternative: Docker Deployment

The `Dockerfile` at the repo root produces a self-contained image. It builds in three stages: client (Vite), server (TypeScript), and production (Node.js Alpine with non-root user). The final image runs `node server/dist/index.js` and listens on port 8080.

### 9.1 Build and Test Locally

```bash
docker build -t telestrations:local .
docker run -p 8080:8080 -e NODE_ENV=production -e ALLOWED_ORIGIN=http://localhost:8080 telestrations:local
```

Open `http://localhost:8080` to verify.

### 9.2 Push to Azure Container Registry

```bash
# Create a registry (one-time)
az acr create \
  --name telestrationsacr \
  --resource-group rg-telestrations \
  --sku Basic \
  --admin-enabled true

# Log in to the registry
az acr login --name telestrationsacr

# Build and push
docker build -t telestrationsacr.azurecr.io/telestrations:latest .
docker push telestrationsacr.azurecr.io/telestrations:latest
```

### 9.3 Deploy as a Container on App Service

```bash
az webapp config container set \
  --name telestrations-app \
  --resource-group rg-telestrations \
  --container-image-name telestrationsacr.azurecr.io/telestrations:latest \
  --container-registry-url https://telestrationsacr.azurecr.io \
  --container-registry-user $(az acr credential show --name telestrationsacr --query username -o tsv) \
  --container-registry-password $(az acr credential show --name telestrationsacr --query "passwords[0].value" -o tsv)
```

### 9.4 When to Use Docker vs Direct Deployment

The direct deployment (GitHub Actions workflow) is simpler for this project because:
- There are no OS-level dependencies — it's pure Node.js.
- The workflow already handles the two-project build correctly.
- No container registry to maintain.

Use Docker if you want to:
- Run the exact same build locally and in production with no environment differences.
- Deploy to Azure Container Apps instead of App Service (Container Apps scales to zero, which eliminates idle cost — but note that scaling to zero kills in-memory state).
- Use a different hosting provider in the future without changing the deployment workflow.

---

## 10. Maintenance Checklist

**When a new Node.js LTS version is released (approximately every October):**

1. Update the App Service runtime:
   ```bash
   az webapp config set \
     --name telestrations-app \
     --resource-group rg-telestrations \
     --linux-fx-version "NODE|22-lts"
   ```
2. Update `.github/workflows/ci.yml` and `deploy.yml` — change `node-version: 20` to the new version in both files.
3. Update `Dockerfile` — change the `FROM node:20-alpine` lines.
4. Test locally with the new version, then push.

**Monthly:**

- Check for vulnerable dependencies:
  ```bash
  npm --prefix server audit
  npm --prefix client audit
  ```
  Fix high-severity issues with `npm audit fix`. For breaking changes, review the changelog before upgrading.

**Monitor App Service metrics:**

```bash
# Average memory usage over the last hour
az monitor metrics list \
  --resource $(az webapp show --name telestrations-app --resource-group rg-telestrations --query id -o tsv) \
  --metric MemoryWorkingSet \
  --interval PT1H \
  --output table
```

The worst-case memory per game is ~30MB (20 players, full rotation). On B1's 1.75GB, this supports ~50 concurrent worst-case games. At realistic game sizes (6-8 players), you have headroom for several hundred concurrent games before memory becomes a concern.

**Renewing the SSL certificate:**

Azure renews the managed certificate automatically. No action needed. If a renewal fails (rare), Azure will notify you via the email on your account. Re-run the `az webapp config ssl create` command from section 3.3 to force a renewal.
