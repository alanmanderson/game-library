#!/bin/bash
# Lemonade Stand Tycoon - Azure Deployment Script
# Deploys backend to Azure App Service and frontend to Azure Static Web Apps

set -e

# Configuration
SUBSCRIPTION_ID="1a020407-3f63-418b-91be-af42a0a2cfef"
RESOURCE_GROUP="rg-lemonadestand"
LOCATION="centralus"
APP_SERVICE_PLAN="plan-lemonadestand"
BACKEND_APP="api-lemonadestand"
FRONTEND_APP="app-lemonadestand"
SKU="B1"

echo "=== Lemonade Stand Tycoon - Azure Deployment ==="
echo ""

# Set subscription
echo "Setting subscription..."
az account set --subscription "$SUBSCRIPTION_ID"

# Create resource group
echo "Creating resource group..."
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --output none

# Create App Service Plan
echo "Creating App Service Plan..."
az appservice plan create \
  --name "$APP_SERVICE_PLAN" \
  --resource-group "$RESOURCE_GROUP" \
  --sku "$SKU" \
  --is-linux \
  --output none

# Create Backend Web App
echo "Creating Backend Web App..."
az webapp create \
  --name "$BACKEND_APP" \
  --resource-group "$RESOURCE_GROUP" \
  --plan "$APP_SERVICE_PLAN" \
  --runtime "DOTNETCORE:8.0" \
  --output none

# Configure Backend
echo "Configuring Backend..."
az webapp config set \
  --name "$BACKEND_APP" \
  --resource-group "$RESOURCE_GROUP" \
  --always-on true \
  --output none

az webapp config appsettings set \
  --name "$BACKEND_APP" \
  --resource-group "$RESOURCE_GROUP" \
  --settings \
    ASPNETCORE_ENVIRONMENT=Production \
    ASPNETCORE_URLS=http://+:8080 \
  --output none

# Enable CORS for frontend
az webapp cors add \
  --name "$BACKEND_APP" \
  --resource-group "$RESOURCE_GROUP" \
  --allowed-origins "https://lemonadestand.alanmanderson.com" "https://app-lemonadestand-web.azurewebsites.net" "http://localhost:5173" \
  --output none

# Create Static Web App for Frontend
echo "Creating Static Web App..."
az staticwebapp create \
  --name "$FRONTEND_APP" \
  --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --sku Free \
  --output none 2>/dev/null || echo "Static web app may already exist or needs GitHub integration"

# Build and deploy backend
echo ""
echo "=== Building Backend ==="
cd /app/backend
PATH="/home/claude/.dotnet:$PATH" dotnet publish LemonadeStand.Api/LemonadeStand.Api.csproj \
  -c Release \
  -o ./publish

echo ""
echo "=== Deploying Backend ==="
cd /app/backend/publish
zip -r /tmp/backend.zip . -q
az webapp deploy \
  --name "$BACKEND_APP" \
  --resource-group "$RESOURCE_GROUP" \
  --src-path /tmp/backend.zip \
  --type zip \
  --output none

# Build frontend with production API URL
echo ""
echo "=== Building Frontend ==="
cd /app/frontend
VITE_API_URL="https://api.lemonadestand.alanmanderson.com" npm run build

echo ""
echo "=== Deploying Frontend ==="
# Deploy using SWA CLI or direct upload
npx --yes @azure/static-web-apps-cli deploy \
  ./dist \
  --env production \
  --app-name "$FRONTEND_APP" \
  --resource-group "$RESOURCE_GROUP" \
  --no-use-keychain 2>/dev/null || {
    echo "SWA CLI deploy failed, trying alternative method..."
    # Alternative: deploy to a second webapp
    az webapp create \
      --name "${FRONTEND_APP}-web" \
      --resource-group "$RESOURCE_GROUP" \
      --plan "$APP_SERVICE_PLAN" \
      --runtime "NODE:20-lts" \
      --output none 2>/dev/null || true

    # Create a simple express server for static files
    cd /app/frontend/dist
    cat > server.js << 'SERVEREOF'
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const MIME_TYPES = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
  const ext = path.extname(filePath);

  if (!ext || !fs.existsSync(filePath)) {
    filePath = path.join(__dirname, 'index.html');
  }

  const contentType = MIME_TYPES[path.extname(filePath)] || 'application/octet-stream';

  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  } catch (e) {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
SERVEREOF

    cat > package.json << 'PKGEOF'
{"name":"lemonade-stand-frontend","version":"1.0.0","scripts":{"start":"node server.js"}}
PKGEOF

    zip -r /tmp/frontend.zip . -q
    az webapp deploy \
      --name "${FRONTEND_APP}-web" \
      --resource-group "$RESOURCE_GROUP" \
      --src-path /tmp/frontend.zip \
      --type zip \
      --output none

    FRONTEND_URL="https://${FRONTEND_APP}-web.azurewebsites.net"
  }

BACKEND_URL="https://api.lemonadestand.alanmanderson.com"
FRONTEND_URL="${FRONTEND_URL:-https://lemonadestand.alanmanderson.com}"

echo ""
echo "=== Deployment Complete ==="
echo "Backend URL:  $BACKEND_URL"
echo "Frontend URL: $FRONTEND_URL"
echo ""
echo "To configure custom domain (lemonadestand.alanmanderson.com):"
echo "  1. Add CNAME record pointing to: ${FRONTEND_APP}.azurestaticapps.net"
echo "  2. Run: az staticwebapp hostname set --name $FRONTEND_APP --hostname lemonadestand.alanmanderson.com"
echo ""
echo "API Health Check:"
curl -s "$BACKEND_URL/api/game" || echo "(Backend may take a minute to start)"
