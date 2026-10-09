import { type Cc100HardwareProfile } from '../../shared/hardware-profile';
import { wagoFw31IdentityCheck } from '../host/firmware-identity';
import { checks } from '../host/hardware-deployment';
import { hardwareOwnership } from '../host/hardware-deployment';
import { rootValue } from '../host/hardware-deployment';
import { runtimeContainment } from '../host/hardware-deployment';
import { wagoHardwareDeploymentPreflightScript } from '../host/hardware-deployment';
import { WAGO_HARDWARE_PROFILE } from '../host/hardware-deployment';
import { wagoRuntimeSupervisorAcknowledgeShell, wagoRuntimeSupervisorLaunchShell } from './supervisor';
import { wagoShellFilesystemGuard } from '../host/shell/filesystem';
export function wagoRuntimeBootScript(testRoot = '', profile: Cc100HardwareProfile = WAGO_HARDWARE_PROFILE): string {
  return `#!/bin/sh
set -eu
umask 077
root=${rootValue(testRoot)}
unset DOCKER_HOST DOCKER_CONTEXT DOCKER_TLS_VERIFY DOCKER_CERT_PATH
export DOCKER_HOST=unix:///var/run/docker.sock
command -v timeout >/dev/null || exit 1
docker_cli=$(command -v docker) || exit 1
docker() { timeout -k 5 10 "$docker_cli" --host unix:///var/run/docker.sock "$@"; }
config="$root/etc/attraccess-wago"
hook="$root/etc/rc.d/S99_zz_attraccess_wago"
may_stop=0
supervisor_owner=0
fail() { echo "$*" >&2; exit 1; }
${runtimeContainment()}
contain_supervisor_failure() (
  flock() {
    # An exhausted monitor keeps supervisor ownership until the competing
    # transaction releases install.lock. It cannot acknowledge or restart in
    # this state, and must not abandon the writer merely because the lock is busy.
    if test "$action" = supervise; then
      until command flock "$@"; do
        validate_controller_lock || return 1
        sleep 2 || return 1
      done
    else
      command flock "$@"
    fi
  }
  ${wagoShellFilesystemGuard()}
  # Enablement is durable operator intent, not a transient observation result.
  # Only an explicit stop, installation rollback or replacement disables it.
  contain_runtime
)
# Direct exits and errexit from every embedded observation use the same bounded
# containment path. Failure to verify stopping is never a successful receipt.
trap 'status=$?; trap - EXIT; if test "$status" -ne 0; then if test "$supervisor_owner" = 1; then if contain_supervisor_failure; then if test "$action" = start && test -f "$config/runtime-enabled"; then nohup "$hook" supervise </dev/null >/dev/null 2>&1 9>&- & fi; else echo "Runtime supervisor containment unverified; recovery required" >&2; fi; elif test "$may_stop" = 1; then contain_runtime || echo "Runtime containment unverified; recovery required" >&2; fi; fi; exit "$status"' EXIT
trap 'exit 130' HUP INT TERM
action=\${1:-}
case "$action" in
  supervise)
    ${wagoShellFilesystemGuard({ lockName: 'supervisor.lock', descriptor: 8 })}
    supervisor_owner=1
    test -f "$hook" && test ! -L "$hook" && test "$(stat -c '%u:%g:%a:%h' "$hook")" = 0:0:700:1 || fail 'Unsafe runtime boot hook'
    retries=0
    record_failure() {
      report=$(mktemp "$config/supervisor-report.XXXXXX")
      { date -u '+%Y-%m-%dT%H:%M:%SZ'; printf 'exit=%s action=%s\\n' "$status" "$cycle"; dd if="$gate_error" bs=1 count=4096 2>/dev/null; } > "$report"
      test ! -d "$config/supervisor.last-error" || fail 'Unsafe supervisor diagnostic path'
      mv -f "$report" "$config/supervisor.last-error"
    }
    while test -f "$config/runtime-enabled"; do
      # Only requests present before this gate may use its observation. A new
      # transaction can run between the child releasing install.lock and our
      # receipt publication; it must wait for the next complete gate.
      set -- "$config"/supervisor-start.*
      cycle=cycle
      test "$retries" -lt 5 || cycle=watch
      gate_error=$(mktemp "$config/supervisor-error.XXXXXX")
      if observation=$(timeout -k 5 300 "$hook" "$cycle" 8>&- 2>"$gate_error"); then
        rm -f "$gate_error"
        case "$observation" in
          started) retries=$((retries + 1)) ;;
          running) retries=0 ;;
          disabled) exit 0 ;;
          *) fail 'Invalid runtime supervisor observation' ;;
        esac
        ${wagoRuntimeSupervisorAcknowledgeShell()}
      else
        status=$?
        record_failure
        rm -f "$gate_error"
        if test "$status" = 75; then
          # The other transaction owns the writer. Never stop it on lock contention.
          sleep 2
        else
          # A timed-out child may not have run its trap. Verify OFF before retrying.
          contain_supervisor_failure || fail 'Runtime supervisor containment unverified; recovery required'
          # Retry only through a new complete hardware gate. Keep crash loops bounded
          # to five starts per burst, with a cooldown rather than permanent disablement.
          sleep 30
          retries=0
        fi
        continue
      fi
      sleep 2
    done
    exit 0 ;;
  start|stop)
    ${wagoShellFilesystemGuard()}
    test -f "$hook" && test ! -L "$hook" && test "$(stat -c '%u:%g:%a:%h' "$hook")" = 0:0:700:1 || fail 'Unsafe runtime boot hook'
    exec 9>&-
    supervisor_owner=1
    # Bound the complete gate, including host /proc and filesystem observations.
    # The outer owner contains a timeout even if the child cannot run its trap.
    if timeout -k 5 300 "$hook" "$action-checked"; then
      if test "$action" = start; then
        # Readiness runs a second full gate. Its 330s acknowledgement and 300s
        # lock-reacquisition budgets must not be nested in the first gate's 300s.
        ${wagoShellFilesystemGuard()}
        ${wagoRuntimeSupervisorLaunchShell()}
      fi
      exit 0
    else
      status=$?
      # A transaction may acquire the lock between the outer check and child.
      # Contention never authorizes stopping its writer after it releases it.
      test "$status" != 75 || supervisor_owner=0
      exit "$status"
    fi ;;
  start-checked) action=start ;;
  stop-checked) action=stop ;;
  cycle|watch) ;;
  *) fail 'Invalid runtime lifecycle action' ;;
esac
# Lock contention belongs to another transaction. A supervisor retries it,
# without stopping that transaction's runtime or opening a second writer.
fail() {
  echo "$*" >&2
  case "$*" in 'Another runtime transaction holds the controller lock') exit 75 ;; esac
  exit 1
}
${wagoShellFilesystemGuard()}
if test "$action" = stop; then
  rm -f "$config/runtime-enabled"
  contain_runtime || fail 'Runtime stop unverified; recovery required'
  exit 0
fi
if test ! -e "$config/runtime-enabled" && test ! -L "$config/runtime-enabled"; then
  case "$action" in cycle|watch) echo disabled ;; esac
  exit 0
fi
may_stop=1
command -v nohup >/dev/null || fail 'Runtime supervisor launcher unavailable'
test -f "$config/runtime-enabled" && test ! -L "$config/runtime-enabled" && test "$(stat -c '%u:%g:%a:%h' "$config/runtime-enabled")" = 0:0:600:1 || fail 'Invalid runtime enablement'
${wagoFw31IdentityCheck(true)} || fail 'unsupported-firmware'
# Wait for the vendor daemon; no network downloads, host restarts or infinite retry.
attempt=0
until docker info >/dev/null 2>&1; do
  attempt=$((attempt + 1)); test "$attempt" -lt 15 || fail 'docker-start-timeout'
  sleep 2
done
# hardwareOwnership below checks host writers immediately before granting IO;
# the complete post-grant preflight checks them again before starting a writer.
# Do not add a third identical scan before those two required boundaries.
${checks(testRoot, true, false)}
[ "$exclusivity" = clear ] || fail "$exclusivity"
${hardwareOwnership()}
${wagoHardwareDeploymentPreflightScript(testRoot, true, profile)}
test "$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' attraccess-wago)" = no || fail 'Invalid runtime restart policy'
running=$(docker inspect --format '{{.State.Running}}' attraccess-wago) || fail 'Cannot observe runtime'
case "$running" in
  false)
    test "$action" != watch || fail 'Runtime crash retry limit reached'
    docker start attraccess-wago >/dev/null || fail 'runtime-start-failed'
    test "$(docker inspect --format '{{.State.Running}}' attraccess-wago)" = true || fail 'Runtime start unverified'
    observation=started ;;
  true) observation=running ;;
  *) fail 'Invalid runtime state' ;;
esac
if test "$action" = start; then
  # The outer start action performs the separately bounded supervisor handoff.
  :
else
  echo "$observation"
fi
`;
}
