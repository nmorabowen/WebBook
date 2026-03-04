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
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"

    if [[ -z "$line" || "$line" == \#* ]]; then
      continue
    fi

    if [[ "$line" != *=* ]]; then
      continue
    fi

    local key="${line%%=*}"
    local value="${line#*=}"

    if [[ ! "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
      continue
    fi

    if [[ "$value" =~ ^\".*\"$ || "$value" =~ ^\'.*\'$ ]]; then
      value="${value:1:${#value}-2}"
    fi

    printf -v "$key" '%s' "$value"
    export "$key"
  done < "$WEBBOOK_ENV_FILE"
}

compose() {
  docker compose \
    --project-name webbook \
    --env-file "$WEBBOOK_ENV_FILE" \
    -f "$WEBBOOK_COMPOSE_FILE" \
    "$@"
}

quote_env_value() {
  local value="$1"
  printf "'%s'" "$(printf '%s' "$value" | sed "s/'/'\\\\''/g")"
}

set_env_value() {
  local file="$1"
  local key="$2"
  local value="$3"
  local escaped

  escaped="$(quote_env_value "$value" | sed 's/[&|]/\\&/g')"

  if grep -q "^${key}=" "$file"; then
    sed -i "s|^${key}=.*|${key}=${escaped}|" "$file"
  else
    printf '%s=%s\n' "$key" "$(quote_env_value "$value")" >> "$file"
  fi
}

get_env_value() {
  local file="$1"
  local key="$2"
  grep "^${key}=" "$file" | tail -n 1 | cut -d '=' -f 2-
}

write_release_state() {
  local file="$1"
  local release_ref="$2"
  cat > "$file" <<EOF
RELEASED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
RELEASE_REF=$release_ref
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

current_repo_ref() {
  git -C "$WEBBOOK_REPO_DIR" rev-parse HEAD
}

checkout_repo_ref() {
  local target="${1:-main}"

  require_file "$WEBBOOK_REPO_DIR/.git/HEAD"
  git -C "$WEBBOOK_REPO_DIR" fetch --tags origin
  git -C "$WEBBOOK_REPO_DIR" fetch origin main

  if git -C "$WEBBOOK_REPO_DIR" rev-parse --verify "origin/$target^{commit}" > /dev/null 2>&1; then
    git -C "$WEBBOOK_REPO_DIR" checkout -f --detach "origin/$target"
    return
  fi

  if git -C "$WEBBOOK_REPO_DIR" rev-parse --verify "$target^{commit}" > /dev/null 2>&1; then
    git -C "$WEBBOOK_REPO_DIR" checkout -f --detach "$target"
    return
  fi

  echo "Unknown release ref: $target" >&2
  exit 1
}
