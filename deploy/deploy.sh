#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/common.sh"

usage() {
  cat <<'EOF'
Usage:
  deploy.sh deploy <sha-or-tag>
  deploy.sh rollback
EOF
}

deploy_release() {
  local target="$1"
  local env_backup="$WEBBOOK_STATE_DIR/env.before-deploy"
  local current_web
  local current_python
  local next_web
  local next_python

  load_env

  current_web="$WEB_IMAGE"
  current_python="$PYTHON_IMAGE"
  next_web="${current_web%:*}:$target"
  next_python="${current_python%:*}:$target"

  cp "$WEBBOOK_ENV_FILE" "$env_backup"
  write_release_state "$WEBBOOK_STATE_DIR/previous-release.env" "$current_web" "$current_python"
  write_release_state "$WEBBOOK_STATE_DIR/pending-release.env" "$next_web" "$next_python"

  set_env_value "$WEBBOOK_ENV_FILE" "WEB_IMAGE" "$next_web"
  set_env_value "$WEBBOOK_ENV_FILE" "PYTHON_IMAGE" "$next_python"

  if ! compose pull web python-runner; then
    cp "$env_backup" "$WEBBOOK_ENV_FILE"
    echo "Image pull failed. Restored previous environment." >&2
    exit 1
  fi

  compose up -d redis python-runner web

  if wait_for_release_health; then
    write_release_state "$WEBBOOK_STATE_DIR/current-release.env" "$next_web" "$next_python"
    rm -f "$WEBBOOK_STATE_DIR/pending-release.env"
    echo "Deploy succeeded: $target"
    return 0
  fi

  echo "Deploy health check failed. Rolling back." >&2
  cp "$env_backup" "$WEBBOOK_ENV_FILE"
  compose pull web python-runner || true
  compose up -d redis python-runner web
  wait_for_release_health || true
  rm -f "$WEBBOOK_STATE_DIR/pending-release.env"
  exit 1
}

rollback_release() {
  local previous_file="$WEBBOOK_STATE_DIR/previous-release.env"
  local env_backup="$WEBBOOK_STATE_DIR/env.before-rollback"
  local current_web
  local current_python
  local rollback_web
  local rollback_python

  require_file "$previous_file"
  load_env

  current_web="$WEB_IMAGE"
  current_python="$PYTHON_IMAGE"
  rollback_web="$(get_env_value "$previous_file" "WEB_IMAGE")"
  rollback_python="$(get_env_value "$previous_file" "PYTHON_IMAGE")"

  if [[ -z "$rollback_web" || -z "$rollback_python" ]]; then
    echo "Rollback state is incomplete." >&2
    exit 1
  fi

  cp "$WEBBOOK_ENV_FILE" "$env_backup"
  write_release_state "$WEBBOOK_STATE_DIR/rollback-source.env" "$current_web" "$current_python"

  set_env_value "$WEBBOOK_ENV_FILE" "WEB_IMAGE" "$rollback_web"
  set_env_value "$WEBBOOK_ENV_FILE" "PYTHON_IMAGE" "$rollback_python"

  compose pull web python-runner || true
  compose up -d redis python-runner web

  if wait_for_release_health; then
    write_release_state "$WEBBOOK_STATE_DIR/current-release.env" "$rollback_web" "$rollback_python"
    write_release_state "$WEBBOOK_STATE_DIR/previous-release.env" "$current_web" "$current_python"
    echo "Rollback succeeded."
    return 0
  fi

  echo "Rollback failed. Restoring pre-rollback environment." >&2
  cp "$env_backup" "$WEBBOOK_ENV_FILE"
  compose up -d redis python-runner web || true
  exit 1
}

main() {
  local command="${1:-}"

  case "$command" in
    deploy)
      local target="${2:-}"
      if [[ -z "$target" ]]; then
        usage
        exit 1
      fi
      deploy_release "$target"
      ;;
    rollback)
      rollback_release
      ;;
    *)
      usage
      exit 1
      ;;
  esac
}

main "$@"
