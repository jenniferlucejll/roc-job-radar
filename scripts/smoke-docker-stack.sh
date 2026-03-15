#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_NAME="${PROJECT_NAME:-roc-job-radar-smoke}"
TEMP_ENV="$(mktemp)"
TEMP_OVERRIDE="$(mktemp)"
BACKEND_PORT="${BACKEND_PORT:-33000}"
FRONTEND_PORT="${FRONTEND_PORT:-33001}"
POSTGRES_PORT="${POSTGRES_PORT:-35432}"
OLLAMA_PORT="${OLLAMA_PORT:-31434}"

cleanup() {
  docker compose \
    -f "$ROOT_DIR/docker-compose.yml" \
    -f "$ROOT_DIR/docker-compose.override.yml" \
    -f "$TEMP_OVERRIDE" \
    --project-name "$PROJECT_NAME" \
    --env-file "$TEMP_ENV" \
    down -v --remove-orphans >/dev/null 2>&1 || true
  rm -f "$TEMP_ENV"
  rm -f "$TEMP_OVERRIDE"
}

trap cleanup EXIT

cp "$ROOT_DIR/.env.example" "$TEMP_ENV"
cat >>"$TEMP_ENV" <<'EOF'
POSTGRES_PASSWORD=changeme
SERVER_HOST=0.0.0.0
AI_ENABLED=false
EOF
cat >>"$TEMP_ENV" <<EOF
POSTGRES_PORT=${POSTGRES_PORT}
BACKEND_PORT=${BACKEND_PORT}
FRONTEND_PORT=${FRONTEND_PORT}
OLLAMA_PORT=${OLLAMA_PORT}
EOF

cat >"$TEMP_OVERRIDE" <<EOF
services:
  postgres:
    env_file:
      - ${TEMP_ENV}
  backend:
    env_file:
      - ${TEMP_ENV}
    environment:
      POSTGRES_PORT: "5432"
EOF

docker compose \
  -f "$ROOT_DIR/docker-compose.yml" \
  -f "$ROOT_DIR/docker-compose.override.yml" \
  -f "$TEMP_OVERRIDE" \
  --project-name "$PROJECT_NAME" \
  --env-file "$TEMP_ENV" \
  up -d --build

for _ in {1..60}; do
  if curl -fsS "http://localhost:${BACKEND_PORT}/health" >/dev/null && curl -fsS "http://localhost:${FRONTEND_PORT}" >/dev/null; then
    echo "Docker smoke check passed"
    exit 0
  fi
  sleep 2
done

echo "Docker smoke check failed" >&2
docker compose \
  -f "$ROOT_DIR/docker-compose.yml" \
  -f "$ROOT_DIR/docker-compose.override.yml" \
  -f "$TEMP_OVERRIDE" \
  --project-name "$PROJECT_NAME" \
  --env-file "$TEMP_ENV" \
  ps >&2
docker compose \
  -f "$ROOT_DIR/docker-compose.yml" \
  -f "$ROOT_DIR/docker-compose.override.yml" \
  -f "$TEMP_OVERRIDE" \
  --project-name "$PROJECT_NAME" \
  --env-file "$TEMP_ENV" \
  logs --tail=200 >&2
exit 1
