#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${IS_RUNNING_CURSOR_CLOUD_AGENT:-}" ]]; then
  echo "ERROR: This script is intended for Cursor Cloud Agents only." >&2
  echo "Set IS_RUNNING_CURSOR_CLOUD_AGENT=1 in Cursor secrets." >&2
  exit 1
fi

: "${GPG_PRIVATE_KEY_BASE64:?Error: GPG_PRIVATE_KEY_BASE64 not set in Cursor Secrets}"
: "${GPG_PRIVATE_KEY_PASSPHRASE:?Error: GPG_PRIVATE_KEY_PASSPHRASE not set in Cursor Secrets}"
: "${MY_GIT_EMAIL:?Error: MY_GIT_EMAIL not set in Cursor Secrets}"
: "${MY_FULL_NAME:?Error: MY_FULL_NAME not set in Cursor Secrets}"

install_gnupg() {
  if command -v apt-get >/dev/null 2>&1; then
    if command -v sudo >/dev/null 2>&1; then
      sudo apt-get update && sudo apt-get install -y gnupg2
    else
      apt-get update && apt-get install -y gnupg2
    fi
    return 0
  fi

  if command -v apk >/dev/null 2>&1; then
    if command -v sudo >/dev/null 2>&1; then
      sudo apk add --no-cache gnupg
    else
      apk add --no-cache gnupg
    fi
    return 0
  fi

  if command -v dnf >/dev/null 2>&1; then
    if command -v sudo >/dev/null 2>&1; then
      sudo dnf install -y gnupg2
    else
      dnf install -y gnupg2
    fi
    return 0
  fi

  if command -v yum >/dev/null 2>&1; then
    if command -v sudo >/dev/null 2>&1; then
      sudo yum install -y gnupg2
    else
      yum install -y gnupg2
    fi
    return 0
  fi

  return 1
}

if ! command -v gpg >/dev/null 2>&1; then
  echo "[GPG] gpg not found. Attempting to install gnupg..." >&2
  if ! install_gnupg; then
    echo "ERROR: Unable to install gnupg. Install gpg manually." >&2
    exit 1
  fi
fi

echo "[GPG] Setting up GPG signing for $MY_FULL_NAME..."

export GNUPGHOME="${GNUPGHOME:-$HOME/.gnupg}"
mkdir -p "$GNUPGHOME"
chmod 700 "$GNUPGHOME"

cat > "$GNUPGHOME/gpg-agent.conf" <<'EOF'
allow-preset-passphrase
default-cache-ttl 28800
max-cache-ttl 86400
EOF

if command -v gpgconf >/dev/null 2>&1; then
  gpgconf --kill gpg-agent 2>/dev/null || true
  gpgconf --launch gpg-agent
fi

echo "$GPG_PRIVATE_KEY_BASE64" | base64 -d | gpg --batch --import 2>/dev/null

KEY_INFO="$(gpg --with-colons --with-keygrip --list-secret-keys "$MY_GIT_EMAIL" 2>/dev/null)"
KEYGRIPS="$(echo "$KEY_INFO" | awk -F: '/^grp:/ {print $10}')"
FINGERPRINT="$(echo "$KEY_INFO" | awk -F: '/^fpr:/ {print $10; exit}')"

if [[ -z "$KEYGRIPS" ]] || [[ -z "$FINGERPRINT" ]]; then
  echo "ERROR: Failed to extract keygrip(s) or fingerprint for $MY_GIT_EMAIL" >&2
  echo "Available keys:" >&2
  gpg --list-secret-keys >&2
  exit 1
fi

GPG_PRESET=""
for preset_path in \
  "/usr/lib/gnupg/gpg-preset-passphrase" \
  "/usr/lib/gnupg2/gpg-preset-passphrase" \
  "/usr/libexec/gpg-preset-passphrase"; do
  if [[ -x "$preset_path" ]]; then
    GPG_PRESET="$preset_path"
    break
  fi
done

if [[ -z "$GPG_PRESET" ]] && command -v gpg-preset-passphrase >/dev/null 2>&1; then
  GPG_PRESET="$(command -v gpg-preset-passphrase)"
fi

if [[ -z "$GPG_PRESET" ]]; then
  echo "[GPG] gpg-preset-passphrase not found. Attempting to install gnupg..." >&2
  if install_gnupg; then
    for preset_path in \
      "/usr/lib/gnupg/gpg-preset-passphrase" \
      "/usr/lib/gnupg2/gpg-preset-passphrase" \
      "/usr/libexec/gpg-preset-passphrase"; do
      if [[ -x "$preset_path" ]]; then
        GPG_PRESET="$preset_path"
        break
      fi
    done
  fi
fi

if [[ -z "$GPG_PRESET" ]]; then
  echo "ERROR: gpg-preset-passphrase not found after install." >&2
  exit 1
fi

for KEYGRIP in $KEYGRIPS; do
  printf '%s' "$GPG_PRIVATE_KEY_PASSPHRASE" | "$GPG_PRESET" --preset "$KEYGRIP"
done

git config --global user.name "$MY_FULL_NAME"
git config --global user.email "$MY_GIT_EMAIL"
git config --global user.signingkey "$FINGERPRINT"
git config --global commit.gpgsign true
git config --global gpg.program "$(command -v gpg)"

if echo "test" | gpg --batch --yes \
  --local-user "$FINGERPRINT" --clearsign >/dev/null 2>&1; then
  echo "[GPG] Signing configured successfully."
  echo "  Name: $MY_FULL_NAME"
  echo "  Email: $MY_GIT_EMAIL"
  echo "  Fingerprint: $FINGERPRINT"
else
  echo "ERROR: GPG signing verification failed." >&2
  gpg --list-secret-keys "$MY_GIT_EMAIL" >&2
  exit 1
fi
