# ---------------------------------------------------------------------------
# Stage 1: Build frontend (Vite)
# ---------------------------------------------------------------------------
FROM node:20-alpine AS frontend-build
ARG GIT_SHA
ENV VITE_GIT_SHA=$GIT_SHA

WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 2: Build Python dependencies
# ---------------------------------------------------------------------------
FROM python:3.12-slim AS builder

WORKDIR /build
COPY backend/requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ---------------------------------------------------------------------------
# Stage 3: Production image
# ---------------------------------------------------------------------------
FROM python:3.12-slim AS production
ARG GIT_SHA
ENV GIT_SHA=$GIT_SHA

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY --from=builder /install /usr/local

# Copy backend code
COPY backend/ ./backend/

# Copy built frontend
COPY --from=frontend-build /build/dist ./frontend/dist

RUN adduser --disabled-password --gecos "" appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

CMD ["sh", "-c", "cd /app/backend && alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
