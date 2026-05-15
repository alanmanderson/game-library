# ---------------------------------------------------------------------------
# Stage 1: Install dependencies (workspace root)
# ---------------------------------------------------------------------------
FROM node:20-alpine AS deps

WORKDIR /build
COPY package.json package-lock.json ./
COPY apps/client/package.json ./apps/client/
COPY apps/server/package.json ./apps/server/
COPY packages/shared/package.json ./packages/shared/
RUN npm ci

# ---------------------------------------------------------------------------
# Stage 2: Build the client (Vite)
# ---------------------------------------------------------------------------
FROM deps AS client-build

COPY . .
RUN npm run build --workspace=@forbidden-island/client

# ---------------------------------------------------------------------------
# Stage 3: Production image
# ---------------------------------------------------------------------------
FROM node:20-alpine AS production

RUN addgroup -S app && adduser -S app -G app

WORKDIR /app

# Copy workspace root package files
COPY package.json package-lock.json ./
COPY apps/server/package.json ./apps/server/
COPY packages/shared/package.json ./packages/shared/

# Install production deps + tsx for TypeScript execution
RUN npm ci --omit=dev && npm install --no-save tsx

# Copy server source
COPY apps/server/src ./apps/server/src
COPY apps/server/tsconfig.json ./apps/server/

# Copy shared package source
COPY packages/shared/src ./packages/shared/src
COPY packages/shared/tsconfig.json ./packages/shared/

# Copy workspace config needed for resolution
COPY tsconfig.base.json ./

# Copy built client assets
COPY --from=client-build /build/apps/client/dist ./apps/client/dist

ENV NODE_ENV=production
ENV PORT=3000
ENV CLIENT_DIST_PATH=/app/apps/client/dist

EXPOSE 3000

USER app

CMD ["npx", "tsx", "apps/server/src/index.ts"]
