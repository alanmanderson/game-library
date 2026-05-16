# ---------------------------------------------------------------------------
# Stage 1: Build frontend (Vite)
# ---------------------------------------------------------------------------
FROM node:20-alpine AS frontend-build

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
RUN pip install --no-cache-dir --prefix=/install torch --index-url https://download.pytorch.org/whl/cpu numpy

# ---------------------------------------------------------------------------
# Stage 3: Production image
# ---------------------------------------------------------------------------
FROM python:3.12-slim AS production

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY --from=builder /install /usr/local

# Copy backend code
COPY backend/ ./backend/

# Copy ML inference code and trained models
COPY ml/encoder.py ml/model.py ml/bot_integration.py ml/bearoff.py ./ml/
COPY ml/models/backgammon_model_final.pt ml/models/v2_model.pt ml/models/bearoff.npz ./ml/models/

# Copy built frontend
COPY --from=frontend-build /build/dist ./frontend/dist

RUN adduser --disabled-password --gecos "" appuser
RUN chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

CMD ["sh", "-c", "cd /app/backend && alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
