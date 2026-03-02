#!/bin/sh
set -e

STORAGE_ROOT=${STORAGE_ROOT:-/app/storage}

# Chown only when needed: directory exists and is not already owned by appuser
if [ -d "$STORAGE_ROOT" ]; then
  current_uid=$(stat -c '%u' "$STORAGE_ROOT" 2>/dev/null) || true
  appuser_uid=$(id -u appuser)
  if [ "$current_uid" != "$appuser_uid" ]; then
    chown -R appuser:appuser "$STORAGE_ROOT" || echo "Warning: could not chown $STORAGE_ROOT (e.g. NFS/SMB); app may have restricted write access"
  fi
fi

if command -v su-exec >/dev/null 2>&1; then
  exec su-exec appuser "$@"
else
  exec gosu appuser "$@"
fi
