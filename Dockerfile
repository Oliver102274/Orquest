FROM node:22-bookworm-slim AS frontend
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# Public SPA identifiers only. Never declare secret build arguments.
ARG VITE_AUTH0_ENABLED=false
ARG VITE_AUTH0_DOMAIN
ARG VITE_AUTH0_CLIENT_ID
ARG VITE_AUTH0_AUDIENCE
RUN npm run build

FROM python:3.11-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 ORQUESTRA_PUBLIC_DEMO=true
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend/ backend/
COPY data/ data/
COPY --from=frontend /build/frontend/dist/ frontend/dist/
RUN useradd --create-home --uid 10001 orquest
USER orquest
EXPOSE 10000
CMD ["sh", "-c", "exec uvicorn backend.production:create_public_app --factory --host 0.0.0.0 --port ${PORT:-10000} --workers 1 --no-access-log"]
