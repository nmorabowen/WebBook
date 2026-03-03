#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/common.sh"

load_env

cat <<EOF
${DOMAIN} {
  encode gzip zstd

  header {
    X-Content-Type-Options nosniff
    X-Frame-Options SAMEORIGIN
    Referrer-Policy strict-origin-when-cross-origin
    Permissions-Policy interest-cohort=()
  }

  reverse_proxy 127.0.0.1:3000
}
EOF
