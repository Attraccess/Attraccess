/**
 * The caller holds install.lock and defines config, hook and fail(). Release
 * that lock for a completed supervisor gate, then reacquire it before returning
 * to the caller's transaction cleanup. A receipt alone never proves liveness.
 */
export function wagoRuntimeSupervisorLaunchShell(): string {
  return `launch_runtime_supervisor() {
  command -v nohup >/dev/null && command -v sleep >/dev/null || return 1
  test -f "$hook" && test ! -L "$hook" &&
    test "$(stat -c '%u:%g:%a:%h' "$hook")" = 0:0:700:1 || return 1
  supervisor_launch=$(mktemp -d "$config/supervisor-start.XXXXXX") || return 1
  # Caller rollback must never run without its transaction lock. Retain its
  # traps privately and restore them only after reacquiring that same lock.
  trap > "$supervisor_launch/traps" || return 1
  trap - EXIT
  supervisor_interrupted=0
  # Defer a catchable interruption until rollback can again own install.lock.
  trap 'supervisor_interrupted=1' HUP INT TERM
  exec 9>&-
  supervisor_attempt=0
  supervisor_acknowledged=0
  while test "$supervisor_attempt" -lt 15; do
    # Existing owners acknowledge only after completing a gate under install.lock.
    nohup "$hook" supervise </dev/null >/dev/null 2>&1 9>&- &
    sleep 2 || break
    if test -e "$supervisor_launch/ready" || test -L "$supervisor_launch/ready"; then
      if test -f "$supervisor_launch/ready" && test ! -L "$supervisor_launch/ready" &&
        test "$(stat -c '%u:%g:%a:%h' "$supervisor_launch/ready")" = 0:0:600:1; then
        supervisor_acknowledged=1
      fi
      break
    fi
    supervisor_attempt=$((supervisor_attempt + 1))
  done
  supervisor_attempt=0
  if ! { test -f "$config/install.lock" && test ! -L "$config/install.lock" &&
    test "$(stat -c '%u:%g:%a:%h' "$config/install.lock")" = 0:0:600:1; }; then
    rm -rf "$supervisor_launch"
    trap - EXIT HUP INT TERM
    exit 75
  fi
  exec 9<>"$config/install.lock"
  until flock -n 9; do
    supervisor_attempt=$((supervisor_attempt + 1))
    if test "$supervisor_attempt" -ge 15 || ! sleep 2; then
      rm -rf "$supervisor_launch"
      # Leave recovery ownership intact. Neither the caller nor its outer boot
      # wrapper may roll back a different transaction while this lock is held.
      trap - EXIT HUP INT TERM
      echo 'Runtime supervisor handoff lock unverified; recovery required' >&2
      exit 75
    fi
  done
  trap - EXIT HUP INT TERM
  . "$supervisor_launch/traps"
  supervisor_live=0
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
  rm -rf "$supervisor_launch" || return 1
  test "$supervisor_live" = 1
}
launch_runtime_supervisor || fail 'Runtime supervisor launch unverified'`;
}

/** Acknowledge the request paths captured in "$@" before the successful gate. */
export function wagoRuntimeSupervisorAcknowledgeShell(): string {
  return `acknowledge_supervisor_request() {
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
