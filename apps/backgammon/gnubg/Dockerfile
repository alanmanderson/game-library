FROM python:3.12-slim

# gnubg ships neural-net weights + bearoff DBs under /usr/share/games/gnubg/
# via apt. This layer is cached and never re-downloads on rebuild.
RUN apt-get update \
    && apt-get install -y --no-install-recommends gnubg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

EXPOSE 8001

# One subprocess per container; uvicorn with a single worker is deliberate.
# Adding workers would fan out multiple gnubg subprocesses and oversubscribe
# the 1 vCPU B1s VM.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "1"]
