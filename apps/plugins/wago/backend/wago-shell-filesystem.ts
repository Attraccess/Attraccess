/**
 * Shared root-owned configuration and flock boundary. The caller defines root,
 * config and fail(), and uses umask 077. Existing untrusted paths are rejected;
 * changing their ownership would leave attacker-selected entries in use.
 */
export function wagoShellFilesystemGuard({
  acquireLock = true,
  lockName = 'install.lock',
  descriptor = 9,
}: {
  acquireLock?: boolean;
  lockName?: 'install.lock' | 'supervisor.lock';
  descriptor?: 8 | 9;
} = {}): string {
  return `
${wagoShellRootDirectoryCheck()}
wago_require_root_directory "$root/etc" || fail 'Unsafe configuration parent ownership or permissions'
if test ! -e "$config" && test ! -L "$config"; then
  mkdir -m 0700 "$config" || fail 'Cannot create private runtime configuration'
fi
test -d "$config" && test ! -L "$config" || fail 'Runtime configuration must be a regular directory'
test "$(stat -c '%u:%g:%a' "$config")" = 0:0:700 || fail 'Unsafe runtime configuration ownership or permissions'
${
  acquireLock
    ? `if test ! -e "$config/${lockName}" && test ! -L "$config/${lockName}"; then
  (set -C; : > "$config/${lockName}") || fail 'Cannot create controller lock'
fi`
    : ''
}
validate_controller_lock() {
  test -f "$config/${lockName}" && test ! -L "$config/${lockName}" &&
    test "$(stat -c '%u:%g:%a:%h' "$config/${lockName}")" = 0:0:600:1
}
validate_controller_lock || fail 'Unsafe controller lock ownership, permissions or file type'
${
  acquireLock
    ? `exec ${descriptor}<>"$config/${lockName}"
flock -n ${descriptor} || fail 'Another runtime transaction holds the controller lock'
validate_controller_lock || fail 'Controller lock changed during acquisition'`
    : ''
}
`;
}

/** Define a check for a root-owned directory with no group/other write access. */
export function wagoShellRootDirectoryCheck(): string {
  return `wago_require_root_directory() {
  test ! -L "$1" && wago_require_root_directory_or_alias "$1"
}
wago_directory_metadata_safe() {
  test -d "$1" && test ! -L "$1" || return 1
  wago_directory_metadata=$(stat -c '%u:%g:%a' "$1") || return 1
  case "$wago_directory_metadata" in 0:0:[0-7][0145][0145]) return 0 ;; *) return 1 ;; esac
}
wago_require_root_directory_or_alias() (
  # Resolve one component at a time. Canonicalizing first would erase unsafe
  # aliases and ancestors (including components followed by '..'). The fixture
  # root represents /; production always starts at the actual filesystem root.
  wago_base=\${root:-/}
  wago_directory_metadata_safe "$wago_base" || exit 1
  wago_resolved="$wago_base"
  wago_pending="$1"
  case "$wago_pending" in /*) ;; *) exit 1 ;; esac
  wago_absolute=1
  wago_links=0
  while test -n "$wago_pending"; do
    if test "$wago_absolute" = 1; then
        if test "$wago_base" = /; then
          wago_pending=\${wago_pending#/}
        else
          case "$wago_pending" in
            "$wago_base") wago_pending= ;;
            "$wago_base"/*) wago_pending=\${wago_pending#"$wago_base"/} ;;
            *) exit 1 ;;
          esac
        fi
        wago_resolved="$wago_base"
        wago_absolute=0
    fi
    wago_component=\${wago_pending%%/*}
    case "$wago_pending" in */*) wago_pending=\${wago_pending#*/} ;; *) wago_pending= ;; esac
    case "$wago_component" in
      ''|.) continue ;;
      ..)
        test "$wago_resolved" != "$wago_base" || exit 1
        wago_resolved=\${wago_resolved%/*}
        test -n "$wago_resolved" || wago_resolved=/
        continue ;;
    esac
    wago_next="\${wago_resolved%/}/$wago_component"
    if test -L "$wago_next"; then
      test "$(stat -c '%u:%g' "$wago_next")" = 0:0 || exit 1
      wago_links=$((wago_links + 1)); test "$wago_links" -le 40 || exit 1
      wago_target=$(readlink "$wago_next") || exit 1
      test -n "$wago_target" || exit 1
      case "$wago_target" in /*) wago_absolute=1 ;; esac
      wago_pending="$wago_target\${wago_pending:+/$wago_pending}"
    else
      wago_directory_metadata_safe "$wago_next" || exit 1
      wago_resolved="$wago_next"
    fi
  done
)`;
}
