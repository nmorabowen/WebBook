#!/usr/bin/env bash
set -euo pipefail

WEBBOOK_ROOT="${WEBBOOK_ROOT:-/opt/webbook}"
WEBBOOK_REPO_DIR="${WEBBOOK_REPO_DIR:-$WEBBOOK_ROOT/repo}"
WEBBOOK_ENV_FILE="${WEBBOOK_ENV_FILE:-$WEBBOOK_ROOT/.env.production}"
WEBBOOK_COMPOSE_FILE="${WEBBOOK_COMPOSE_FILE:-$WEBBOOK_REPO_DIR/docker-compose.production.yml}"
WEBBOOK_STATE_DIR="${WEBBOOK_STATE_DIR:-$WEBBOOK_ROOT/deploy/state}"

mkdir -p "$WEBBOOK_STATE_DIR"

require_file() {
  local target="$1"
  if [[ ! -f "$target" ]]; then
    echo "Missing required file: $target" >&2
    exit 1
  fi
}

load_env() {
  require_file "$WEBBOOK_ENV_FILE"
  set -a
  # shellcheck disable=SC1090
  . "$WEBBOOK_ENV_FILE"
  set +a
}

compose() {
  docker compose \
    --project-name webbook \
    --env-file "$WEBBOOK_ENV_FILE" \
    -f "$WEBBOOK_COMPOSE_FILE" \
    "$@"
}

set_env_value() {
  local file="$1"
  local key="$2"
  local value="$3"
  local escaped

  escaped="$(printf '%s' "$value" | sed 's/[&|]/\\&/g')"

  if grep -q "^${key}=" "$file"; then
    sed -i "s|^${key}=.*|${key}=${escaped}|" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

get_env_value() {
  local file="$1"
  local key="$2"
  grep "^${key}=" "$file" | tail -n 1 | cut -d '=' -f 2-
}

write_release_state() {
  local file="$1"
  local web_image="$2"
  local python_image="$3"
  cat > "$file" <<EOF
RELEASED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
WEB_IMAGE=$web_image
PYTHON_IMAGE=$python_image
EOF
}

wait_for_http() {
  local url="$1"
  local retries="${2:-30}"
  local delay="${3:-2}"
  local attempt

  for ((attempt = 1; attempt <= retries; attempt += 1)); do
    if curl -fsS "$url" > /dev/null 2>&1; then
      return 0
    fi

    sleep "$delay"
  done

  return 1
}

wait_for_container_health() {
  local service="$1"
  local retries="${2:-30}"
  local delay="${3:-2}"
  local attempt
  local container_id
  local state

  for ((attempt = 1; attempt <= retries; attempt += 1)); do
    container_id="$(compose ps -q "$service" 2>/dev/null || true)"
    if [[ -n "$container_id" ]]; then
      state="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id" 2>/dev/null || true)"
      if [[ "$state" == "healthy" || "$state" == "running" ]]; then
        return 0
      fi
    fi

    sleep "$delay"
  done

  return 1
}

wait_for_release_health() {
  wait_for_http "http://127.0.0.1:3000/api/healthz" 45 2
  wait_for_container_health "python-runner" 45 2
}

sync_repo_checkout() {
  local branch="${1:-main}"
  require_file "$WEBBOOK_REPO_DIR/.git/HEAD"
  git -C "$WEBBOOK_REPO_DIR" fetch --depth 1 origin "$branch"
  git -C "$WEBBOOK_REPO_DIR" checkout -f "$branch"
  git -C "$WEBBOOK_REPO_DIR" reset --hard "origin/$branch"
}
