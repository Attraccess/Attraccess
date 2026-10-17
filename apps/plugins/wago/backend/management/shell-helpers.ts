import { wagoShellStat } from '../host/shell/stat';
export function managementShellHelpers(): string {
  return String.raw`set -eu
${wagoShellStat()}
now() {
  IFS='. ' read -r whole fraction idle < /proc/uptime
  case "$whole" in *[!0-9]*|'') exit 1;; esac
  case "$fraction" in [0-9][0-9]) ;; *) exit 1;; esac
  uptime=$((whole * 100 + (100$fraction % 100)))
}
unexpired() {
  test "$(cat /proc/sys/kernel/random/boot_id)" = "$(cat "$tx/boot-id")"
  read -r deadline < "$tx/deadline"
  case "$deadline" in *[!0-9]*|'') exit 1;; esac
  now
  remaining=$((deadline - uptime))
  test "$remaining" -gt 0
  delay=$(printf '%s.%02d' "$((remaining / 100))" "$((remaining % 100))")
  test ! -e "$tx/expired"
}
safe_keys() {
  test ! -L authorized_keys
  if [ -e authorized_keys ]; then
    test -f authorized_keys
    test "$(stat -c '%u:%a:%h' authorized_keys)" = "$uid:600:1"
    test "$(wc -c < authorized_keys)" -le 65536
  fi
}
owned() {
  test -d "$tx" && test "$(stat -c '%u:%a' "$tx")" = "$uid:700"
  test -f "$tx/token" && test ! -L "$tx/token"
  test "$(cat "$tx/token")" = "$token"
}
active() {
  owned
  test ! -e "$tx/committed" && test ! -e "$tx/recovered"
  test -f "$tx/armed"
  unexpired
}
`;
}
