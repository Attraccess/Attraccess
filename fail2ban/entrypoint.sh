#!/bin/sh
# Substitute env-driven jail thresholds, materialise filter, then exec the
# upstream fail2ban entrypoint. The crazymax/fail2ban image reads config from
# /data, so jail + filter end up there.

set -eu

JAIL_TEMPLATE="${ATTRACCESS_JAIL_TEMPLATE:-/etc/attraccess/jail.d/attraccess.conf}"
FILTER_TEMPLATE="${ATTRACCESS_FILTER_TEMPLATE:-/etc/attraccess/filter.d/attraccess-auth.conf}"
JAIL_DST="/data/jail.d/attraccess.conf"
FILTER_DST="/data/filter.d/attraccess-auth.conf"

MAXRETRY="${F2B_ATTRACCESS_MAXRETRY:-5}"
FINDTIME="${F2B_ATTRACCESS_FINDTIME:-900}"
BANTIME="${F2B_ATTRACCESS_BANTIME:-900}"

for v in MAXRETRY FINDTIME BANTIME; do
  eval "val=\$$v"
  case "$val" in
    ''|*[!0-9]*)
      echo "fail2ban entrypoint: F2B_ATTRACCESS_$v must be a positive integer, got '$val'" >&2
      exit 1
      ;;
  esac
done

mkdir -p /data/jail.d /data/filter.d

sed \
  -e "s|@@MAXRETRY@@|$MAXRETRY|g" \
  -e "s|@@FINDTIME@@|$FINDTIME|g" \
  -e "s|@@BANTIME@@|$BANTIME|g" \
  "$JAIL_TEMPLATE" > "$JAIL_DST"

cp "$FILTER_TEMPLATE" "$FILTER_DST"

echo "fail2ban entrypoint: attraccess-auth jail configured (maxretry=$MAXRETRY findtime=$FINDTIME bantime=$BANTIME)"

if [ -x /entrypoint.sh ]; then
  exec /entrypoint.sh "$@"
fi
exec fail2ban-server -f -x -v start
