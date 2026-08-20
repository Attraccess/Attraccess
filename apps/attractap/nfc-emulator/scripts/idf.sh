#!/bin/sh
set -eu

if ! command -v idf.py >/dev/null 2>&1; then
  echo "idf.py not found; source ESP-IDF export.sh first" >&2
  exit 127
fi

exec idf.py -D SDKCONFIG_DEFAULTS=sdkconfig.defaults "$@"
