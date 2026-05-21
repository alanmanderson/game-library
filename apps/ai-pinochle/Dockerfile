# ---------------------------------------------------------------------------
# Stage 1: Build web frontend (Vite, npm workspaces)
# ---------------------------------------------------------------------------
FROM node:20-alpine AS frontend-build
ARG GOOGLE_CLIENT_ID
ARG GIT_SHA
ENV VITE_GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID
ENV VITE_GIT_SHA=$GIT_SHA

WORKDIR /build
COPY package.json package-lock.json ./
COPY web/package.json ./web/
COPY shared/package.json ./shared/
RUN npm ci --workspace=web --workspace=shared --include-workspace-root

COPY web/ ./web/
COPY shared/ ./shared/
COPY public/ ./public/
RUN npm run build --workspace=web

# ---------------------------------------------------------------------------
# Stage 2: Production image
# ---------------------------------------------------------------------------
FROM python:3.12-slim
ARG GIT_SHA
ENV GIT_SHA=$GIT_SHA

WORKDIR /app

# Install dependencies
COPY server/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy server code
COPY server/ /app/

# Copy card images to where main.py expects them:
# Path(__file__).parent.parent.parent / "public" / "img"
# __file__ = /app/app/main.py -> parent.parent.parent = /
COPY public/img/ /public/img/

# Copy built web frontend
COPY --from=frontend-build /build/web/dist /app/web-dist/

EXPOSE 8000

COPY server/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

RUN adduser --disabled-password --gecos "" appuser
USER appuser

CMD ["/entrypoint.sh"]
