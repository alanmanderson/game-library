# ---------------------------------------------------------------------------
# Stage 1: Install dependencies
# ---------------------------------------------------------------------------
FROM python:3.12-slim AS builder

WORKDIR /build
COPY requirements.txt ./
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ---------------------------------------------------------------------------
# Stage 2: Production image
# ---------------------------------------------------------------------------
FROM python:3.12-slim AS production
ARG GIT_SHA
ENV GIT_SHA=$GIT_SHA

RUN adduser --disabled-password --gecos "" appuser

WORKDIR /app

COPY --from=builder /install /usr/local
COPY . .
RUN rm -rf tests/ __pycache__/ .pytest_cache/

RUN chown -R appuser:appuser /app

ENV FLASK_CONFIG=production
ENV PORT=5000

EXPOSE 5000

USER appuser

CMD ["gunicorn", "wsgi:app", "--bind", "0.0.0.0:5000", "--workers", "2"]
