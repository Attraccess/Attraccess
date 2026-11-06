import { wagoShellStat } from '../host/shell/stat';

/**
 * The caller holds install.lock and defines config, hook and fail(). Release
 * that lock for a completed supervisor gate, then reacquire it before returning
 * to the caller's transaction cleanup. A receipt alone never proves liveness.
 */
export function wagoRuntimeSupervisorLaunchShell(): string {
  return `${wagoShellStat()}
# A live supervisor publishes ready into every supervisor-start.* that lacks it.
# Removing a request in place races that: rm unlinks ready, the supervisor
# writes it again, and rmdir fails with "Directory not empty". Move the request
# out of that name first. Writers address it by its old path, so they now fail
# instead of refilling the directory that is being removed. The destination is
# reserved before the request exists: a same-directory rename and removal need
# no new inode, so a full configuration filesystem cannot strand the request.
retire_runtime_supervisor_request() {
  mv "$supervisor_launch" "$supervisor_retired/request" || return 1
  rm -rf "$supervisor_retired"
}
launch_runtime_supervisor() {
  supervisor_failure_stage=prerequisites
  command -v nohup >/dev/null && command -v sleep >/dev/null || return 1
  test -f "$hook" && test ! -L "$hook" &&
    test "$(stat -c '%u:%g:%a:%h' "$hook")" = 0:0:700:1 || return 1
  supervisor_retired=$(mktemp -d "$config/supervisor-retired.XXXXXX") || return 1
  if ! supervisor_launch=$(mktemp -d "$config/supervisor-start.XXXXXX"); then
    rm -rf "$supervisor_retired"
    return 1
  fi
  # Caller rollback must never run without its transaction lock. Retain its
  # traps privately and restore them only after reacquiring that same lock.
  if ! trap > "$supervisor_launch/traps"; then
    retire_runtime_supervisor_request
    return 1
  fi
  trap - EXIT
  supervisor_interrupted=0
  # Defer a catchable interruption until rollback can again own install.lock.
  trap 'supervisor_interrupted=1' HUP INT TERM
  exec 9>&-
  # The complete gate remains bounded to 300s. Allow 30s for launch, its kill
  # grace and acknowledgement scheduling; lock reacquisition stays at 300s.
  supervisor_wait_remaining=330
  supervisor_candidate=
  supervisor_acknowledged=0
  supervisor_failure_stage=readiness
  while test "$supervisor_wait_remaining" -gt 0 && test "$supervisor_interrupted" = 0; do
    # Existing owners acknowledge only after completing a gate under install.lock.
    # Do not pile up workers while a candidate is starting or an owner is gating.
    if { test -n "$supervisor_candidate" && kill -0 "$supervisor_candidate" 2>/dev/null; } ||
      { test -f "$config/supervisor.lock" && test ! -L "$config/supervisor.lock" &&
        test "$(stat -c '%u:%g:%a:%h' "$config/supervisor.lock")" = 0:0:600:1 &&
        (exec 8<>"$config/supervisor.lock"; ! flock -n 8); }; then
      :
    else
      nohup "$hook" supervise </dev/null >/dev/null 2>&1 9>&- &
      supervisor_candidate=$!
    fi
    sleep 2 || break
    supervisor_wait_remaining=$((supervisor_wait_remaining - 2))
    if test -e "$supervisor_launch/ready" || test -L "$supervisor_launch/ready"; then
      if test -f "$supervisor_launch/ready" && test ! -L "$supervisor_launch/ready" &&
        test "$(stat -c '%u:%g:%a:%h' "$supervisor_launch/ready")" = 0:0:600:1; then
        supervisor_acknowledged=1
      fi
      break
    fi
  done
  supervisor_wait_remaining=300
  if ! { test -f "$config/install.lock" && test ! -L "$config/install.lock" &&
    test "$(stat -c '%u:%g:%a:%h' "$config/install.lock")" = 0:0:600:1; }; then
    retire_runtime_supervisor_request
    trap - EXIT HUP INT TERM
    echo 'Runtime supervisor handoff lock unverified; recovery required' >&2
    exit 75
  fi
  exec 9<>"$config/install.lock"
  until flock -n 9; do
    if test "$supervisor_wait_remaining" -le 0 || ! sleep 2; then
      retire_runtime_supervisor_request
      # Leave recovery ownership intact. Neither the caller nor its outer boot
      # wrapper may roll back a different transaction while this lock is held.
      trap - EXIT HUP INT TERM
      echo 'Runtime supervisor handoff lock unverified; recovery required' >&2
      exit 75
    fi
    supervisor_wait_remaining=$((supervisor_wait_remaining - 2))
  done
  trap - EXIT HUP INT TERM
  . "$supervisor_launch/traps"
  supervisor_live=0
  if test "$supervisor_acknowledged" = 1; then supervisor_failure_stage=owner-verification; fi
  if test "$supervisor_interrupted" = 0 && test "$supervisor_acknowledged" = 1 &&
    test -f "$config/install.lock" && test ! -L "$config/install.lock" &&
    test "$(stat -c '%u:%g:%a:%h' "$config/install.lock")" = 0:0:600:1 &&
    test -f "$config/runtime-enabled" && test ! -L "$config/runtime-enabled" &&
    test "$(stat -c '%u:%g:%a:%h' "$config/runtime-enabled")" = 0:0:600:1 &&
    test -f "$config/supervisor.lock" && test ! -L "$config/supervisor.lock" &&
    test "$(stat -c '%u:%g:%a:%h' "$config/supervisor.lock")" = 0:0:600:1; then
    supervisor_pid=$(cat "$supervisor_launch/ready") || supervisor_pid=
    case "$supervisor_pid" in
      ''|*[!0-9]*|0|1) ;;
      *)
        if kill -0 "$supervisor_pid" 2>/dev/null &&
          (exec 8<>"$config/supervisor.lock"; ! flock -n 8); then supervisor_live=1; fi ;;
    esac
  fi
  retire_runtime_supervisor_request || return 1
  test "$supervisor_live" = 1
}
launch_runtime_supervisor || fail "Runtime supervisor launch unverified: $supervisor_failure_stage"`;
}

/** Acknowledge the request paths captured in "$@" before the successful gate. */
export function wagoRuntimeSupervisorAcknowledgeShell(): string {
  return `${wagoShellStat()}
acknowledge_supervisor_request() {
  test -d "$supervisor_request" && test ! -L "$supervisor_request" &&
    test "$(stat -c '%u:%g:%a' "$supervisor_request")" = 0:0:700 || return 1
  if test -e "$supervisor_request/ready" || test -L "$supervisor_request/ready"; then
    test -f "$supervisor_request/ready" && test ! -L "$supervisor_request/ready" &&
      test "$(stat -c '%u:%g:%a:%h' "$supervisor_request/ready")" = 0:0:600:1
    return "$?"
  fi
  supervisor_ready_stage=$(mktemp "$supervisor_request/.ready.XXXXXX") || return 1
  test -f "$supervisor_ready_stage" && test ! -L "$supervisor_ready_stage" &&
    test "$(stat -c '%u:%g:%a:%h' "$supervisor_ready_stage")" = 0:0:600:1 || return 1
  printf '%s\\n' "$$" > "$supervisor_ready_stage" || return 1
  # Publish last: the caller may immediately remove its acknowledged request.
  mv "$supervisor_ready_stage" "$supervisor_request/ready"
}
acknowledge_runtime_supervisor() {
  for supervisor_request in "$@"; do
    if test ! -e "$supervisor_request" && test ! -L "$supervisor_request"; then continue; fi
    if ! acknowledge_supervisor_request; then
      # A concurrent caller may have consumed the receipt and removed its own
      # private directory. Remaining invalid metadata is always a real failure.
      test ! -e "$supervisor_request" && test ! -L "$supervisor_request" || return 1
    fi
  done
}
acknowledge_runtime_supervisor "$@" || fail 'Unsafe supervisor acknowledgement request'`;
}
