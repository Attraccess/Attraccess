import { wagoShellFilesystemGuard } from './wago-shell-filesystem';
import { quote } from './wago-runtime-install.bounded-docker.helpers';
import { boundedDocker } from './wago-runtime-install.bounded-docker.helpers';

export function preamble(testRoot: string, locked = false, waitForLock = false): string {
  if (testRoot && (!testRoot.startsWith('/') || testRoot === '/' || testRoot.includes('\n')))
    throw new Error('Test root must be an absolute isolated directory');
  return `set -eu
umask 077
root=${quote(testRoot.replace(/\/$/, ''))}
unset DOCKER_HOST DOCKER_CONTEXT DOCKER_TLS_VERIFY DOCKER_CERT_PATH
${boundedDocker()}
config="$root/etc/attraccess-wago"
hook="$root/etc/rc.d/S99_zz_attraccess_wago"
data="$root/var/lib/attraccess-wago"
tx="$root/var/lib/attraccess-wago-install-transaction"
cleanup="$tx.cleanup"
acceptedCleanup="$tx.accepted-cleanup"
receipt="$tx.restored"
fail() { echo "$*" >&2; exit 1; }
${wagoShellFilesystemGuard({ acquireLock: !locked, waitForLock })}
for pending in "$root/var/lib/attraccess-wago-update-transaction" "$root/var/lib"/attraccess-wago-update-cleanup-*; do
  test ! -e "$pending" && test ! -L "$pending" || fail 'Managed runtime update recovery or acknowledgement required'
done
wago_require_root_directory_or_alias "$root/var" && wago_require_root_directory_or_alias "$root/var/lib" || fail 'Unsafe runtime journal parent'
for journal in "$tx" "$cleanup" "$acceptedCleanup" "$receipt" "$config/delivery" "$config/docker-provision" "$config"/docker-provision.completed-*; do
  if test -e "$journal" || test -L "$journal"; then
    test -d "$journal" && test ! -L "$journal" &&
      test "$(stat -c '%u:%g:%a' "$journal")" = 0:0:700 || fail 'Unsafe runtime journal ownership, permissions or file type'
  fi
done
test ! -e "$tx" || { test ! -e "$cleanup" && test ! -e "$receipt" && test ! -e "$acceptedCleanup"; } || fail 'Conflicting runtime journals require manual inspection'
require_owner() {
  expected=$1
  for journal in "$tx" "$receipt" "$cleanup" "$config/delivery"; do
    if [ -d "$journal" ]; then
      test -f "$journal/token" && test ! -L "$journal/token" || fail 'Runtime transaction has no ownership token'
      actual=$(cat "$journal/token")
      test "$actual" = "$expected" || fail 'Runtime transaction belongs to another commissioning session'
      return 0
    fi
  done
  fail 'No runtime transaction to recover'
}
validate_snapshot() {
  if test -e "$tx/mode" || test -L "$tx/mode"; then
    test -f "$tx/mode" && test ! -L "$tx/mode" && test "$(cat "$tx/mode")" = destructive || return 1
  else
    # Valid base transactions may be contained, but never restore their former
    # containers, data or credentials under the destructive product policy.
    for field in old-running had-data had-env had-ca; do
      test -f "$tx/$field" && test ! -L "$tx/$field" || return 1
      case "$(cat "$tx/$field")" in true|false) ;; *) return 1 ;; esac
    done
  fi
  test -f "$tx/prepared" && test -f "$tx/old-id" && test ! -L "$tx/old-id" || return 1
  test "$(wc -l < "$tx/old-id" | tr -d ' ')" -le 2 || return 1
  grep -Eq '[^a-zA-Z0-9-]|^$' "$tx/old-id" && return 1
  test "$?" = 1 || return 1
}
remove_owned_container() {
  remove_id=$1
  docker update --restart=no "$remove_id" >/dev/null || return 1
  test "$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$remove_id")" = no || return 1
  docker stop "$remove_id" >/dev/null || return 1
  test "$(docker inspect --format '{{.State.Running}}' "$remove_id")" = false || return 1
  docker rm "$remove_id" >/dev/null || return 1
  docker container ls -a --no-trunc --format '{{.ID}}' > "$tx/remaining-containers" || return 1
  grep -Fxq "$remove_id" "$tx/remaining-containers" && return 1
  test "$?" = 1 || return 1
}
rollback() {
  # Never infer absence from lost metadata. An unprepared transaction may only
  # be discarded while its explicit preparation marker still exists.
  if [ -f "$tx/prepared" ]; then
    validate_snapshot || return 1
  else
    test -f "$tx/preparing" || return 1
    for marker in data-changing env-changing ca-changing new-container started; do
      test ! -e "$tx/$marker" || return 1
    done
  fi
  touch "$tx/recovering" || return 1
  rm -f "$config/runtime-enabled" || return 1
  if [ -f "$tx/prepared" ]; then
    # Any failed Docker query is an error, never evidence of container absence.
    docker container ls -a --no-trunc --format '{{.ID}} {{.Names}}' > "$tx/containers" || return 1
    # Validate every recorded predecessor before removing any owned container.
    # This also contains interrupted destructive installs that failed before
    # their predecessor was stopped; it never restores a previous workload.
    if test -s "$tx/old-id"; then
      for old_id in $(cat "$tx/old-id"); do
        old_name=$(awk -v id="$old_id" '$1 == id { print $2 }' "$tx/containers")
        case "$old_name" in
          ''|attraccess-wago|attraccess-wago.previous) ;;
          *) return 1 ;;
        esac
      done
    fi
    for owned_id in $(awk '$2 == "attraccess-wago" || $2 == "attraccess-wago.previous" { print $1 }' "$tx/containers"); do
      remove_owned_container "$owned_id" || return 1
    done
    if [ -f "$tx/data-changing" ]; then rm -rf "$data" || return 1; fi
    if [ -f "$tx/env-changing" ]; then rm -f "$config/runtime.env" || return 1; fi
    if [ -f "$tx/ca-changing" ]; then rm -f "$config/runtime-ca.pem" || return 1; fi
  fi
  rm -f "$config/runtime.env.next" "$config/runtime-ca.pem.next" || return 1
  # Once renamed, even a partially deleted journal is cleanup-only. No retry
  # may interpret its remaining files as instructions to restore again.
  if [ "\${1:-}" = retained ]; then
    mv "$tx" "$receipt" || return 1
    rm -rf "$receipt/bundle" || return 1
  else
    mv "$tx" "$cleanup" || return 1
    rm -rf "$cleanup" || return 1
  fi
}
`;
}
