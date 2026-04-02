#!/bin/sh
set -e

ENABLED=$(echo "${DNS_SERVER_ENABLED:-FALSE}" | tr '[:lower:]' '[:upper:]')
if [ "$ENABLED" != "TRUE" ] && [ "$ENABLED" != "1" ] && [ "$ENABLED" != "YES" ]; then
    echo "[dns-server] disabled; set DNS_SERVER_ENABLED=true to enable"
    while true; do sleep 86400; done
fi

echo "[dns-server] starting"
exec node /app/server.js
