# Stage 1: Build dependencies
FROM python:3.12-slim AS builder

WORKDIR /build

COPY backend/requirements.txt .

# Install all pip dependencies into /install prefix
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# Install ML inference dependencies (CPU-only torch for smaller image)
RUN pip install --no-cache-dir --prefix=/install torch --index-url https://download.pytorch.org/whl/cpu numpy

# Stage 2: Runtime image
FROM python:3.12-slim AS runtime

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Copy installed Python packages from builder
COPY --from=builder /install /usr/local

# Copy backend code
COPY backend/ .

# Copy ML inference code and trained models
COPY ml/encoder.py ml/model.py ml/bot_integration.py ml/bearoff.py ./ml/
COPY ml/models/backgammon_model_final.pt ml/models/v2_model.pt ml/models/bearoff.npz ./ml/models/

EXPOSE 8000

RUN adduser --disabled-password --gecos "" appuser
USER appuser

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
