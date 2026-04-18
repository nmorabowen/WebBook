#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/common.sh"

usage() {
  cat <<'EOF'
Usage:
  deploy.sh update [ref]
  deploy.sh rollback
EOF
}

rebuild_release() {
  if ! compose build web; then
    echo "docker compose build failed." >&2
    return 1
  fi

  if ! compose up -d web; then
    echo "docker compose up failed." >&2
    return 1
  fi

  return 0
}

update_release() {
  local target="${1:-main}"
  local current_ref
  local next_ref

  load_env
  current_ref="$(current_repo_ref)"
  write_release_state "$WEBBOOK_STATE_DIR/previous-release.env" "$current_ref"

  checkout_repo_ref "$target"
  next_ref="$(current_repo_ref)"
  write_release_state "$WEBBOOK_STATE_DIR/pending-release.env" "$next_ref"

  if ! rebuild_release; then
    dump_release_diagnostics
    checkout_repo_ref "$current_ref"
    rebuild_release || true
    echo "Release startup failed. Restored previous release." >&2
    exit 1
  fi

  if wait_for_release_health; then
    write_release_state "$WEBBOOK_STATE_DIR/current-release.env" "$next_ref"
    rm -f "$WEBBOOK_STATE_DIR/pending-release.env"
    echo "Update succeeded: $next_ref"
    return 0
  fi

  echo "Update health check failed. Rolling back." >&2
  dump_release_diagnostics
  checkout_repo_ref "$current_ref"
  rebuild_release || true
  wait_for_release_health || true
  rm -f "$WEBBOOK_STATE_DIR/pending-release.env"
  exit 1
}

rollback_release() {
  local previous_file="$WEBBOOK_STATE_DIR/previous-release.env"
  local current_ref
  local rollback_ref

  require_file "$previous_file"
  load_env

  current_ref="$(current_repo_ref)"
  rollback_ref="$(get_env_value "$previous_file" "RELEASE_REF")"

  if [[ -z "$rollback_ref" ]]; then
    echo "Rollback state is incomplete." >&2
    exit 1
  fi

  write_release_state "$WEBBOOK_STATE_DIR/rollback-source.env" "$current_ref"
  checkout_repo_ref "$rollback_ref"
  rebuild_release

  if wait_for_release_health; then
    write_release_state "$WEBBOOK_STATE_DIR/current-release.env" "$rollback_ref"
    write_release_state "$WEBBOOK_STATE_DIR/previous-release.env" "$current_ref"
    echo "Rollback succeeded."
    return 0
  fi

  echo "Rollback failed. Restoring pre-rollback environment." >&2
  dump_release_diagnostics
  checkout_repo_ref "$current_ref"
  rebuild_release || true
  exit 1
}

main() {
  local command="${1:-}"

  case "$command" in
    update|deploy)
      update_release "${2:-main}"
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
