FROM python:3.12-slim

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install ML inference dependencies (CPU-only torch for smaller image)
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu numpy

# Copy backend code
COPY backend/ .

# Copy ML inference code and trained model
COPY ml/encoder.py ml/model.py ml/bot_integration.py ./ml/
COPY ml/models/backgammon_model_final.pt ./ml/models/

EXPOSE 8000

RUN adduser --disabled-password --gecos "" appuser
USER appuser

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
