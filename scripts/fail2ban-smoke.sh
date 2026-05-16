#!/usr/bin/env bash
# Smoke test for the Attraccess fail2ban jail. Runs the upstream fail2ban
# image against a synthetic log file containing N failed-login lines that match
# the slice-D audit format, then asserts that the offending IP is banned via
# `fail2ban-client status attraccess-auth`.
#
# Designed to run on CI (GitHub Actions, ubuntu-latest). The jail action is
# overridden to `dummy` so the ban is registered in fail2ban's state without
# touching the host firewall, but the upstream image's entrypoint still
# initialises iptables before exec-ing fail2ban-server, so the container is
# granted NET_ADMIN/NET_RAW just like in production compose.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE="crazymax/fail2ban:1.1.0"
CONTAINER="attraccess-fail2ban-smoke"
TEST_IP="10.99.0.42"
MAXRETRY=5
FAILURES=6
TIMEOUT_S=60

WORK="$(mktemp -d)"
trap 'docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; rm -rf "$WORK"' EXIT

mkdir -p "$WORK/jail.d" "$WORK/filter.d" "$WORK/logs"
cp "$REPO_ROOT/fail2ban/jail.d/attraccess.conf" "$WORK/jail.d/attraccess.conf"
cp "$REPO_ROOT/fail2ban/filter.d/attraccess-auth.conf" "$WORK/filter.d/attraccess-auth.conf"

# Point jail at our synthetic log and swap the banaction for dummy so the
# assertion does not depend on host iptables state surviving the run.
sed -i.bak \
  -e "s|/var/lib/docker/containers/\*/\*-json.log|/srv/logs/api.log|" \
  -e "s|action   = %(action_)s|action   = dummy[name=attraccess-auth]|" \
  "$WORK/jail.d/attraccess.conf"
rm "$WORK/jail.d/attraccess.conf.bak"

LOG="$WORK/logs/api.log"
TS="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
for i in $(seq 1 "$FAILURES"); do
  printf 'auth.failed type=login outcome=invalid_credentials ip=%s user_id=- username=mallory ts=%s reason=bad_password\n' \
    "$TEST_IP" "$TS" >> "$LOG"
done

echo "smoke: prepared ${FAILURES} failed-login lines for ${TEST_IP}"

docker run -d --name "$CONTAINER" \
  --cap-add NET_ADMIN \
  --cap-add NET_RAW \
  -e F2B_ATTRACCESS_MAXRETRY="$MAXRETRY" \
  -e F2B_ATTRACCESS_FINDTIME=900 \
  -e F2B_ATTRACCESS_BANTIME=900 \
  -e F2B_LOG_LEVEL=DEBUG \
  -v "$WORK/jail.d:/etc/attraccess/jail.d:ro" \
  -v "$WORK/filter.d:/etc/attraccess/filter.d:ro" \
  -v "$WORK/logs:/srv/logs:ro" \
  -v "$REPO_ROOT/fail2ban/entrypoint.sh:/usr/local/bin/attraccess-fail2ban-entrypoint.sh:ro" \
  --entrypoint /usr/local/bin/attraccess-fail2ban-entrypoint.sh \
  "$IMAGE" >/dev/null

echo "smoke: container started, polling for ban (timeout ${TIMEOUT_S}s)"

deadline=$(( $(date +%s) + TIMEOUT_S ))
while [[ $(date +%s) -lt $deadline ]]; do
  if docker exec "$CONTAINER" fail2ban-client status attraccess-auth 2>/dev/null \
    | grep -q "$TEST_IP"; then
    echo "smoke: PASS — ${TEST_IP} is banned"
    docker exec "$CONTAINER" fail2ban-client status attraccess-auth
    exit 0
  fi
  sleep 1
done

echo "smoke: FAIL — ${TEST_IP} was not banned within ${TIMEOUT_S}s" >&2
echo "--- container state ---" >&2
docker ps -a --filter "name=$CONTAINER" >&2 || true
docker inspect --format '{{.State.Status}} exit={{.State.ExitCode}} oom={{.State.OOMKilled}}' \
  "$CONTAINER" >&2 || true
echo "--- fail2ban-client status ---" >&2
docker exec "$CONTAINER" fail2ban-client status attraccess-auth >&2 || true
echo "--- container logs ---" >&2
docker logs "$CONTAINER" >&2 || true
exit 1
