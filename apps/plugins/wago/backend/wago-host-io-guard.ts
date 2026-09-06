/** Host checks shared by commissioning and every runtime start. The caller supplies
 * root, dout and a bounded local-socket docker() function. Errors return to the
 * caller so its containment handler remains responsible for stopping the writer.
 */
export function wagoHostIoGuardShell(): string {
  return `
wago_host_io_error() {
  host_io_guard_reason="$1"
  return 1
}
wago_host_identity_map() {
  awk 'NF != 3 || $1 != 0 || $2 != 0 || $3 != 4294967295 { bad=1 }
    END { exit (NR != 1 || bad) }' "$1" 2>/dev/null
}
wago_host_process_start() {
  awk '{ sub(/.*\\) /, ""); if (NF < 20 || $20 !~ /^[0-9]+$/) exit 1; print $20; found=1 }
    END { if (!found) exit 1 }' "$1/stat" 2>/dev/null
}
wago_host_owned_process() {
  test -n "$wago_owned_id" || return 1
  wago_host_identity_map "$1/uid_map" && wago_host_identity_map "$1/gid_map" || return 1
  # Container names and PID numbers alone are insufficient. Require a full Docker
  # ID component in every cgroup path, including child cgroups of that container.
  awk -F: -v id="$wago_owned_id" '
    NF != 3 { bad=1; next }
    $3 !~ ("(^|/)docker/" id "(/|$)") &&
      $3 !~ ("(^|/)docker-" id "[.]scope(/|$)") { bad=1 }
    END { exit (NR == 0 || bad) }' "$1/cgroup" 2>/dev/null
}
wago_host_io_guard() {
  host_io_guard_reason=host-io-observation-failed
  wago_owned_id=
  test -d "$root/proc/1" && test -d "$root/proc/self" || return 1
  wago_host_identity_map "$root/proc/self/uid_map" &&
    wago_host_identity_map "$root/proc/self/gid_map" || {
      wago_host_io_error runtime-userns-unsupported; return 1;
    }
  # Numeric container identities must not belong to a host account or group.
  # Non-file NSS sources cannot be established by these local firmware checks.
  if test -e "$root/etc/nsswitch.conf"; then
    awk '/^[ \t]*(passwd|group)[ \t]*:/ {
      sub(/#.*/, ""); sub(/^[^:]*:/, "");
      if (NF != 1 || $1 != "files") bad=1
    } END { exit bad }' "$root/etc/nsswitch.conf" 2>/dev/null || return 1
  fi
  wago_accounts=$(awk -F: '
    /^[ \t]*#/ || /^[ \t]*$/ { next }
    NF != 7 || $3 !~ /^[0-9]+$/ || $4 !~ /^[0-9]+$/ { bad=1 }
    $3 == 10001 || $4 == 10001 { collision=1 }
    END { if (bad) exit 1; print (collision ? "collision" : "clear") }
    ' "$root/etc/passwd" 2>/dev/null) || return 1
  wago_groups=$(awk -F: '
    /^[ \t]*#/ || /^[ \t]*$/ { next }
    NF != 4 || $3 !~ /^[0-9]+$/ { bad=1 }
    $3 == 10001 { collision=1 }
    END { if (bad) exit 1; print (collision ? "collision" : "clear") }
    ' "$root/etc/group" 2>/dev/null) || return 1
  if test "$wago_accounts" != clear || test "$wago_groups" != clear; then
    wago_host_io_error runtime-identity-conflict; return 1
  fi
  wago_security=$(docker info --format '{{json .SecurityOptions}}' 2>/dev/null) || return 1
  case "$wago_security" in
    *userns*|*rootless*) wago_host_io_error runtime-userns-unsupported; return 1 ;;
    '['*']') ;;
    *) return 1 ;;
  esac
  if test "\${1:-}" = allow-owned; then
    wago_owned_id=$(docker container ls -a --no-trunc --filter 'name=^/attraccess-wago$' --format '{{.ID}}' 2>/dev/null) || return 1
    if test -n "$wago_owned_id"; then
      test "\${#wago_owned_id}" = 64 || return 1
      case "$wago_owned_id" in *[!a-f0-9]*) return 1 ;; esac
      wago_owned_state=$(docker inspect --format '{{.Id}} {{.State.Pid}} {{.State.Running}} {{.HostConfig.UsernsMode}}' "$wago_owned_id" 2>/dev/null) || return 1
      # Word splitting here is intentional: only fixed Docker state fields are
      # accepted, never an executable command or user-controlled container name.
      set -- $wago_owned_state
      test "$#" = 3 || { test "$#" = 4 && test "$4" = host; } || return 1
      test "$1" = "$wago_owned_id" || return 1
      case "$2" in ''|*[!0-9]*) return 1 ;; esac
      case "$3:$2" in
        false:0) wago_owned_id= ;;
        true:0) return 1 ;;
        true:*) wago_host_owned_process "$root/proc/$2" || return 1 ;;
        *) return 1 ;;
      esac
    fi
  fi
  wago_dout_inode=$(stat -Lc '%d:%i' "$dout" 2>/dev/null) || return 1
  printf '%s\\n' "$wago_dout_inode" | awk '/^[0-9]+:[0-9]+$/ { ok=1 } END { exit !ok }' || return 1
  for wago_proc in "$root"/proc/[0-9]*; do
    test -d "$wago_proc" || continue
    wago_start=$(wago_host_process_start "$wago_proc") || {
      test ! -d "$wago_proc" && continue
      return 1
    }
    wago_identity=$(awk '
      /^Uid:/ || /^Gid:/ {
        if (NF != 5) bad=1
        for (i=2; i<=NF; i++) { if ($i !~ /^[0-9]+$/) bad=1; if ($i == 10001) collision=1 }
        if ($1 == "Uid:") uid++; else gid++
      }
      /^Groups:/ {
        groups++
        for (i=2; i<=NF; i++) { if ($i !~ /^[0-9]+$/) bad=1; if ($i == 10001) collision=1 }
      }
      END { if (bad || uid != 1 || gid != 1 || groups != 1) exit 1
        print (collision ? "collision" : "clear") }
      ' "$wago_proc/status" 2>/dev/null) || {
        test ! -d "$wago_proc" && continue
        return 1
      }
    wago_owned=0
    if test -n "$wago_owned_id" && wago_host_owned_process "$wago_proc"; then wago_owned=1; fi
    if test "$wago_identity" = collision && test "$wago_owned" != 1; then
      wago_host_io_error runtime-identity-conflict; return 1
    fi
    test -d "$wago_proc/fd" && test -r "$wago_proc/fd" && test -x "$wago_proc/fd" || {
      test ! -d "$wago_proc" && continue
      return 1
    }
    for wago_fd in "$wago_proc"/fd/[0-9]*; do
      test -e "$wago_fd" || test -L "$wago_fd" || continue
      wago_inode=$(stat -Lc '%d:%i' "$wago_fd" 2>/dev/null) || {
        # Closing a descriptor or exiting during observation is normal. A live
        # but unobservable descriptor must not be interpreted as no writer.
        test ! -e "$wago_fd" && test ! -L "$wago_fd" && continue
        return 1
      }
      test "$wago_inode" = "$wago_dout_inode" || continue
      wago_mode=$(awk '/^flags:/ {
        found++; if (NF != 2 || $2 !~ /^[0-7]+$/) { bad=1; next }
        mode=substr($2,length($2),1) % 4
        if (mode == 3) bad=1
      } END { if (found != 1 || bad) exit 1; print mode }
        ' "$wago_proc/fdinfo/\${wago_fd##*/}" 2>/dev/null) || {
          test ! -e "$wago_fd" && test ! -L "$wago_fd" && continue
          return 1
        }
      if test "$wago_mode" != 0 && test "$wago_owned" != 1; then
        wago_host_io_error output-host-process-conflict; return 1
      fi
    done
    wago_end=$(wago_host_process_start "$wago_proc") || {
      test ! -d "$wago_proc" && continue
      return 1
    }
    test "$wago_start" = "$wago_end" || return 1
  done
  host_io_guard_reason=clear
  return 0
}
`;
}
