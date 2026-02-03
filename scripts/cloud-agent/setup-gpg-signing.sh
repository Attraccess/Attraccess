#!/usr/bin/env bash
# This script is designed to be sourced during Cursor Cloud Agent install.
# It runs the GPG initialization script and then clears sensitive env vars.

set -euo pipefail

exit_or_return() {
  local code="${1:-0}"
  if [[ "${BASH_SOURCE[0]}" != "${0}" ]]; then
    return "$code"
  fi
  exit "$code"
}

if [[ -z "${IS_RUNNING_CURSOR_CLOUD_AGENT:-}" ]]; then
  echo "[GPG] IS_RUNNING_CURSOR_CLOUD_AGENT not set; skipping GPG signing setup."
  exit_or_return 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INIT_SCRIPT="${SCRIPT_DIR}/init-gpg-signing.sh"

if [[ ! -f "$INIT_SCRIPT" ]]; then
  echo "[GPG] init script not found: $INIT_SCRIPT" >&2
  exit_or_return 1
fi

if ! bash "$INIT_SCRIPT"; then
  echo "[GPG] init script failed." >&2
  exit_or_return 1
fi

echo "[GPG] Clearing sensitive environment variables..."
unset GPG_PRIVATE_KEY_BASE64
unset GPG_PRIVATE_KEY_PASSPHRASE
unset MY_GIT_EMAIL
unset MY_FULL_NAME
unset IS_RUNNING_CURSOR_CLOUD_AGENT

echo "[GPG] GPG signing setup complete."
