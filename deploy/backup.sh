#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/common.sh"

load_env

mkdir -p "$BACKUP_LOCAL_DIR"

timestamp="$(date -u +"%Y%m%dT%H%M%SZ")"
archive_name="webbook-${timestamp}.tar.gz"
archive_path="${BACKUP_LOCAL_DIR%/}/$archive_name"

tar -czf "$archive_path" \
  -C "$WEBBOOK_ROOT" \
  content \
  .env.production \
  deploy/state

find "$BACKUP_LOCAL_DIR" -type f -name 'webbook-*.tar.gz' -mtime +"${BACKUP_RETENTION_DAYS}" -delete

if [[ -n "${RESTIC_REPOSITORY:-}" && -n "${RESTIC_PASSWORD:-}" ]]; then
  (
    cd "$WEBBOOK_ROOT"
    restic snapshots > /dev/null 2>&1 || restic init
    restic backup content .env.production deploy/state --tag webbook
    restic forget --prune --keep-daily 14 --keep-weekly 8 --keep-monthly 6
  )
fi

echo "Local backup created: $archive_path"
