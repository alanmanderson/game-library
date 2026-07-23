# Dittle — Node/Express + ws with a static public/ frontend (no build step).
# Single production stage: install prod deps, copy source, run as non-root.
FROM node:20-alpine AS production
ARG GIT_SHA
ENV GIT_SHA=$GIT_SHA
ENV NODE_ENV=production
ENV PORT=8080

WORKDIR /app

# Install production dependencies only (leverages layer caching).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy application source.
COPY server ./server
COPY shared ./shared
COPY public ./public
COPY ai ./ai

# Security: run as non-root.
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app

EXPOSE 8080

CMD ["node", "server/server.js"]
