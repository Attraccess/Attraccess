/** Metadata for virtual-clock scenarios whose observed fixture files are root-owned.
 * Keep actual modes/link counts, without starting a Node emulator on every poll.
 * Ownership-changing tests continue to use the general FW31 fixture stat shim.
 */
export function fw31RootOwnedHostStat(): string {
  const observation = process.platform === 'darwin' ? "-f '%Lp:%l'" : "-c '%a:%h'";
  return `#!/bin/sh
set -eu
test "$#" = 3 && test "$1" = -c || exit 99
case "$3" in
  /) path="$FIXTURE_ROOT" ;;
  "$FIXTURE_ROOT"|"$FIXTURE_ROOT/etc/rc.d/S99_zz_attraccess_wago"|"$FIXTURE_ROOT/etc/attraccess-wago/"*) path="$3" ;;
  *) exit 99 ;;
esac
metadata=$(PATH=/usr/bin:/bin command stat ${observation} "$path") || exit 1
mode=\${metadata%%:*}
links=\${metadata#*:}
case "$2" in
  '%u:%g:%a') printf '0:0:%s\\n' "$mode" ;;
  '%u:%g:%a:%h') printf '0:0:%s:%s\\n' "$mode" "$links" ;;
  *) exit 99 ;;
esac
`;
}
