/** No external commands after the transition: inspect this shell, then test access without opening registers. */
export function wagoPrivilegeVerificationShell(): string {
  return `set -efu
seen=' '
while read -r key values; do
  case "$key" in
    Uid:|Gid:|Groups:|CapInh:|CapPrm:|CapEff:|CapBnd:|CapAmb:|NoNewPrivs:)
      case "$seen" in *" $key "*) exit 1 ;; esac
      seen="$seen$key "
      set -- $values
      case "$key" in
        Uid:|Gid:) test "$#" = 4 && test "$1:$2:$3:$4" = 10001:10001:10001:10001 || exit 1 ;;
        Groups:) test "$#" = 0 || exit 1 ;;
        NoNewPrivs:) test "$#" = 1 && test "$1" = 1 || exit 1 ;;
        *) test "$#" = 1 || exit 1; case "$1" in ''|*[!0]*) exit 1 ;; esac ;;
      esac ;;
  esac
done < /proc/$$/status
for key in Uid: Gid: Groups: CapInh: CapPrm: CapEff: CapBnd: CapAmb: NoNewPrivs:; do
  case "$seen" in *" $key "*) ;; *) exit 1 ;; esac
done
if test -r "$din" && test -r "$dout" && test -w "$dout"; then
  printf 'accessible'
else
  printf 'uid10001-access-denied'
fi`;
}

export function wagoPrivilegeProbeShell(): string {
  const verification = `'${wagoPrivilegeVerificationShell().replaceAll("'", "'\\''")}'`;
  // A function scopes transition argv without replacing the caller's pending mount arguments.
  return `wago_probe_privileges() {
hardware=permission-tool-unavailable
if command -v timeout >/dev/null 2>&1; then
  for candidate in setpriv capsh; do
    cli=$(command -v "$candidate") || continue
    help=$(timeout -k 5 10 "$cli" --help 2>/dev/null) || continue
    case "$candidate" in
      setpriv) required='--reuid --regid --clear-groups --bounding-set --inh-caps --ambient-caps --no-new-privs' ;;
      capsh) required='--drop= --groups= --gid= --uid= --caps= --noamb --no-new-privs --shell=' ;;
    esac
    supported=1
    for option in $required; do
      case "$help" in *"$option"*) ;; *) supported=0 ;; esac
    done
    test "$supported" = 1 || continue
    export din dout
    case "$candidate" in
      setpriv) set -- --reuid=10001 --regid=10001 --clear-groups --bounding-set=-all --inh-caps=-all --ambient-caps=-all --no-new-privs /bin/sh -c ${verification} ;;
      capsh) set -- --drop=all --groups= --gid=10001 --uid=10001 --caps= --noamb --no-new-privs --shell=/bin/sh -- -c ${verification} ;;
    esac
    # Foreground wait; the probe shell has no children or background work. Even
    # the kill-after deadline completes before the next candidate or host guard.
    if permission_result=$(timeout -k 5 10 "$cli" "$@" 2>/dev/null); then
      # Denial is a verified result, not a reason to retry with another tool.
      case "$permission_result" in accessible|uid10001-access-denied) hardware=$permission_result; break ;; esac
    fi
  done
fi
}
wago_probe_privileges`;
}
