#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${WEBBOOK_REPO_URL:-https://github.com/nmorabowen/WebBook.git}"
WEBBOOK_ROOT="${WEBBOOK_ROOT:-/opt/webbook}"
WEBBOOK_REPO_DIR="${WEBBOOK_REPO_DIR:-$WEBBOOK_ROOT/repo}"
WEBBOOK_ENV_FILE="${WEBBOOK_ENV_FILE:-$WEBBOOK_ROOT/.env.production}"
WEBBOOK_CONTENT_HOST_PATH="${WEBBOOK_CONTENT_HOST_PATH:-$WEBBOOK_ROOT/content}"
DEPLOY_USER="${SUDO_USER:-$(id -un)}"
DEFAULT_WEB_IMAGE="${DEFAULT_WEB_IMAGE:-webbook-web:local}"
DEFAULT_PYTHON_IMAGE="${DEFAULT_PYTHON_IMAGE:-webbook-python-runner:local}"

require_root() {
  if [[ "$(id -u)" -ne 0 ]]; then
    echo "Please run this installer as root (for example via sudo)." >&2
    exit 1
  fi
}

require_supported_os() {
  local os_id
  local os_codename

  # shellcheck disable=SC1091
  . /etc/os-release
  os_id="${ID:-}"
  os_codename="${VERSION_CODENAME:-}"

  if [[ "$os_id" != "debian" && "$os_id" != "ubuntu" ]]; then
    echo "Unsupported OS: $os_id" >&2
    exit 1
  fi

  if [[ "$os_id" == "debian" && "$os_codename" != "bookworm" ]]; then
    echo "Warning: this installer is optimized for Debian Bookworm. Continuing anyway."
  fi
}

install_packages() {
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y ca-certificates caddy curl git jq openssl restic

  if ! command -v docker > /dev/null 2>&1; then
    curl -fsSL https://get.docker.com | sh
  fi
}

ensure_directories() {
  mkdir -p \
    "$WEBBOOK_ROOT" \
    "$WEBBOOK_ROOT/deploy/state" \
    "$WEBBOOK_ROOT/backups/local"
}

sync_repo() {
  if [[ ! -d "$WEBBOOK_REPO_DIR/.git" ]]; then
    git clone --depth 1 --branch main "$REPO_URL" "$WEBBOOK_REPO_DIR"
    return
  fi

  git -C "$WEBBOOK_REPO_DIR" fetch --depth 1 origin main
  git -C "$WEBBOOK_REPO_DIR" checkout -f main
  git -C "$WEBBOOK_REPO_DIR" reset --hard origin/main
}

prompt_with_default() {
  local prompt="$1"
  local default_value="$2"
  local response

  if [[ -n "$default_value" ]]; then
    read -r -p "$prompt [$default_value]: " response
    printf '%s' "${response:-$default_value}"
  else
    read -r -p "$prompt: " response
    printf '%s' "$response"
  fi
}

prompt_secret() {
  local prompt="$1"
  local response

  read -r -s -p "$prompt: " response
  echo
  printf '%s' "$response"
}

read_existing_value() {
  local key="$1"
  if [[ ! -f "$WEBBOOK_ENV_FILE" ]]; then
    return
  fi
  grep "^${key}=" "$WEBBOOK_ENV_FILE" | tail -n 1 | cut -d '=' -f 2-
}

write_env_file() {
  local domain="$1"
  local admin_username="$2"
  local admin_password_hash="$3"
  local session_secret="$4"
  local content_host_path="$5"
  local restic_repository="$6"
  local restic_password="$7"
  local aws_access_key_id="$8"
  local aws_secret_access_key="$9"
  local aws_region="${10}"

  cat > "$WEBBOOK_ENV_FILE" <<EOF
DOMAIN=$domain
WEBBOOK_ROOT=$WEBBOOK_ROOT
WEBBOOK_CONTENT_HOST_PATH=$content_host_path
CONTENT_ROOT=content

AUTH_DISABLED=false
COOKIE_SECURE=true
ADMIN_USERNAME=$admin_username
ADMIN_PASSWORD_HASH=$admin_password_hash
SESSION_SECRET=$session_secret

REDIS_URL=redis://redis:6379
PYTHON_RUNNER_URL=http://python-runner:8001/execute
PYTHON_TIMEOUT_SECONDS=5

EXECUTION_PER_MINUTE_LIMIT=5
EXECUTION_PER_HOUR_LIMIT=20

WEB_IMAGE=$DEFAULT_WEB_IMAGE
PYTHON_IMAGE=$DEFAULT_PYTHON_IMAGE

BACKUP_LOCAL_DIR=$WEBBOOK_ROOT/backups/local
BACKUP_RETENTION_DAYS=14

RESTIC_REPOSITORY=$restic_repository
RESTIC_PASSWORD=$restic_password
AWS_ACCESS_KEY_ID=$aws_access_key_id
AWS_SECRET_ACCESS_KEY=$aws_secret_access_key
AWS_DEFAULT_REGION=$aws_region
EOF
}

install_webbookctl() {
  install -m 0755 "$WEBBOOK_REPO_DIR/deploy/webbookctl" /usr/local/bin/webbookctl
}

install_backup_timer() {
  cat > /etc/systemd/system/webbook-backup.service <<'EOF'
[Unit]
Description=WebBook backup job

[Service]
Type=oneshot
ExecStart=/usr/local/bin/webbookctl backup
EOF

  cat > /etc/systemd/system/webbook-backup.timer <<'EOF'
[Unit]
Description=Daily WebBook backup timer

[Timer]
OnCalendar=daily
Persistent=true

[Install]
WantedBy=timers.target
EOF

  systemctl daemon-reload
  systemctl enable --now webbook-backup.timer
}

run_initial_deploy() {
  docker compose \
    --project-name webbook \
    --env-file "$WEBBOOK_ENV_FILE" \
    -f "$WEBBOOK_REPO_DIR/docker-compose.production.yml" \
    build web python-runner

  compose_cmd up -d redis python-runner web
}

compose_cmd() {
  docker compose \
    --project-name webbook \
    --env-file "$WEBBOOK_ENV_FILE" \
    -f "$WEBBOOK_REPO_DIR/docker-compose.production.yml" \
    "$@"
}

write_initial_release_state() {
  local release_ref
  release_ref="$(git -C "$WEBBOOK_REPO_DIR" rev-parse HEAD)"

  cat > "$WEBBOOK_ROOT/deploy/state/current-release.env" <<EOF
RELEASED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
RELEASE_REF=$release_ref
EOF
}

main() {
  local existing_domain
  local existing_admin_username
  local existing_password_hash
  local existing_session_secret
  local existing_restic_repository
  local existing_restic_password
  local existing_aws_access_key_id
  local existing_aws_secret_access_key
  local existing_aws_region
  local existing_content_host_path
  local default_domain
  local domain
  local admin_username
  local admin_password=""
  local admin_password_hash
  local session_secret
  local content_host_path
  local restic_repository
  local restic_password
  local aws_access_key_id
  local aws_secret_access_key
  local aws_region

  require_root
  require_supported_os
  install_packages
  ensure_directories
  sync_repo

  if id "$DEPLOY_USER" > /dev/null 2>&1; then
    usermod -aG docker "$DEPLOY_USER" || true
    chown -R "$DEPLOY_USER":"$DEPLOY_USER" "$WEBBOOK_ROOT"
  fi

  existing_domain="$(read_existing_value DOMAIN)"
  existing_admin_username="$(read_existing_value ADMIN_USERNAME)"
  existing_password_hash="$(read_existing_value ADMIN_PASSWORD_HASH)"
  existing_session_secret="$(read_existing_value SESSION_SECRET)"
  existing_content_host_path="$(read_existing_value WEBBOOK_CONTENT_HOST_PATH)"
  existing_restic_repository="$(read_existing_value RESTIC_REPOSITORY)"
  existing_restic_password="$(read_existing_value RESTIC_PASSWORD)"
  existing_aws_access_key_id="$(read_existing_value AWS_ACCESS_KEY_ID)"
  existing_aws_secret_access_key="$(read_existing_value AWS_SECRET_ACCESS_KEY)"
  existing_aws_region="$(read_existing_value AWS_DEFAULT_REGION)"

  default_domain="${existing_domain:-$(hostname -f 2>/dev/null || hostname)}"
  domain="$(prompt_with_default "Domain for WebBook" "$default_domain")"
  admin_username="$(prompt_with_default "Admin username" "${existing_admin_username:-admin}")"
  content_host_path="$(prompt_with_default "Host content path" "${existing_content_host_path:-$WEBBOOK_CONTENT_HOST_PATH}")"

  if [[ -n "$existing_password_hash" ]]; then
    admin_password_hash="$existing_password_hash"
  else
    admin_password="$(prompt_secret "Admin password")"
    admin_password_hash="$(caddy hash-password --plaintext "$admin_password")"
  fi

  if [[ -n "$existing_session_secret" ]]; then
    session_secret="$existing_session_secret"
  else
    session_secret="$(openssl rand -hex 32)"
  fi

  restic_repository="$(prompt_with_default "Restic repository (leave blank for local-only backups)" "$existing_restic_repository")"
  if [[ -n "$restic_repository" ]]; then
    restic_password="$(prompt_with_default "Restic password" "$existing_restic_password")"
    aws_access_key_id="$(prompt_with_default "S3 access key ID" "$existing_aws_access_key_id")"
    aws_secret_access_key="$(prompt_with_default "S3 secret access key" "$existing_aws_secret_access_key")"
    aws_region="$(prompt_with_default "S3 region" "${existing_aws_region:-auto}")"
  else
    restic_password=""
    aws_access_key_id=""
    aws_secret_access_key=""
    aws_region="auto"
  fi

  write_env_file \
    "$domain" \
    "$admin_username" \
    "$admin_password_hash" \
    "$session_secret" \
    "$content_host_path" \
    "$restic_repository" \
    "$restic_password" \
    "$aws_access_key_id" \
    "$aws_secret_access_key" \
    "$aws_region"

  mkdir -p "$content_host_path"

  install_webbookctl
  /usr/local/bin/webbookctl update-config
  install_backup_timer
  run_initial_deploy
  write_initial_release_state

  cat <<EOF

WebBook is installed.

Site URL:
  https://$domain

Paths:
  root: $WEBBOOK_ROOT
  repo: $WEBBOOK_REPO_DIR
  env:  $WEBBOOK_ENV_FILE
  content: $content_host_path

Useful commands:
  webbookctl status
  webbookctl logs web
  webbookctl backup

Next steps:
  1. Open https://$domain after DNS or tunnel routing is in place.
  2. Update later with: webbookctl update
EOF
}

main "$@"
