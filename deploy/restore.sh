#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/common.sh"

usage() {
  echo "Usage: restore.sh <backup-file-or-restic-snapshot>"
}

restore_from_local_archive() {
  local source_archive="$1"
  local temp_dir

  temp_dir="$(mktemp -d)"
  tar -xzf "$source_archive" -C "$temp_dir"
  apply_restore "$temp_dir"
  rm -rf "$temp_dir"
}

restore_from_restic_snapshot() {
  local snapshot_id="$1"
  local temp_dir

  load_env
  if [[ -z "${RESTIC_REPOSITORY:-}" || -z "${RESTIC_PASSWORD:-}" ]]; then
    echo "Restic is not configured on this host." >&2
    exit 1
  fi

  temp_dir="$(mktemp -d)"
  (
    cd "$WEBBOOK_ROOT"
    restic restore "$snapshot_id" --target "$temp_dir"
  )
  apply_restore "$temp_dir"
  rm -rf "$temp_dir"
}

apply_restore() {
  local restore_root="$1"
  local payload_root="$restore_root"

  if [[ -d "$restore_root/$WEBBOOK_ROOT" ]]; then
    payload_root="$restore_root/$WEBBOOK_ROOT"
  fi

  compose down || true

  rm -rf "$WEBBOOK_ROOT/content" "$WEBBOOK_ROOT/deploy/state"
  mkdir -p "$WEBBOOK_ROOT/deploy"

  cp -a "$payload_root/content" "$WEBBOOK_ROOT/content"
  cp -a "$payload_root/deploy/state" "$WEBBOOK_ROOT/deploy/state"
  cp -a "$payload_root/.env.production" "$WEBBOOK_ROOT/.env.production"

  compose up -d redis python-runner web
  wait_for_release_health
  echo "Restore completed."
}

main() {
  local target="${1:-}"
  local local_candidate

  if [[ -z "$target" ]]; then
    usage
    exit 1
  fi

  local_candidate="$target"
  if [[ ! -f "$local_candidate" && -f "${BACKUP_LOCAL_DIR%/}/$target" ]]; then
    local_candidate="${BACKUP_LOCAL_DIR%/}/$target"
  fi

  if [[ -f "$local_candidate" ]]; then
    restore_from_local_archive "$local_candidate"
    exit 0
  fi

  restore_from_restic_snapshot "$target"
}

main "$@"
