# Breadboard monosite image: builds the React frontend, then runs Django/Daphne
# (API + websockets + the built frontend on one port). Build context is the
# repository root (see docker-compose.yml).

# --- Stage 1: frontend build (vite writes to ../backend/frontend_dist) ---
FROM node:22-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- Stage 2: Django app ---
FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

# unixodbc: runtime + headers for pyodbc (SQL Server connections); gcc to build it.
RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc g++ unixodbc unixodbc-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./
COPY --from=frontend /app/backend/frontend_dist ./frontend_dist
COPY docker/entrypoint.sh /entrypoint.sh
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh \
    && mkdir -p /data/backups

# The SQLite database and the Manager -> Backup folder live under /data (a volume).
ENV DJANGO_DB_PATH=/data/db.sqlite3 DJANGO_DEBUG=0
VOLUME /data
EXPOSE 8000
ENTRYPOINT ["/entrypoint.sh"]
CMD ["daphne", "-b", "0.0.0.0", "-p", "8000", "breadboard.asgi:application"]
