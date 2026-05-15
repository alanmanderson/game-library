# ---------------------------------------------------------------------------
# Stage 1: Build the client (Vite)
# ---------------------------------------------------------------------------
FROM node:20-alpine AS client-build

WORKDIR /build/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npx vite build

# ---------------------------------------------------------------------------
# Stage 2: Build the server (TypeScript -> JavaScript)
# ---------------------------------------------------------------------------
FROM node:20-alpine AS server-build

WORKDIR /build/server
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/ ./
RUN npx tsc

# Prune devDependencies so the production image stays small
RUN npm prune --production

# ---------------------------------------------------------------------------
# Stage 3: Production image
# ---------------------------------------------------------------------------
FROM node:20-alpine AS production

# Security: run as non-root
RUN addgroup -S app && adduser -S app -G app

WORKDIR /app

# Copy the server build output and production node_modules
COPY --from=server-build /build/server/dist ./server/dist
COPY --from=server-build /build/server/node_modules ./server/node_modules
COPY --from=server-build /build/server/package.json ./server/package.json

# Copy the built client assets
COPY --from=client-build /build/client/dist ./client/dist

# The server resolves the client path via path.resolve(__dirname, "../../client/dist").
# __dirname at runtime = /app/server/dist, so ../../client/dist = /app/client/dist. Correct.

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

USER app

CMD ["node", "server/dist/index.js"]
