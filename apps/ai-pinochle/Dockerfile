FROM python:3.12-slim

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

EXPOSE 8000

COPY server/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

CMD ["/entrypoint.sh"]
