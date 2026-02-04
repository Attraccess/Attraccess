#!/bin/sh
set -e

STORAGE_ROOT=${STORAGE_ROOT:-/app/storage}

# Ensure storage is owned by appuser (handles fresh mounts and existing volumes)
if [ -d "$STORAGE_ROOT" ]; then
  chown -R appuser:appuser "$STORAGE_ROOT"
fi

exec su-exec appuser "$@"
