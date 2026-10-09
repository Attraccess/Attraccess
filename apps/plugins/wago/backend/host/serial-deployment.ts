import { CC100_SERIAL_HOST_PATH, CC100_SERIAL_PATH } from '../../shared/hardware-profile';
import { wagoShellRootDirectoryCheck } from './shell/filesystem';

/** FW31 owns the UART and persistent dialout permissions; never grant unrelated devices. */
export function wagoSerialDeploymentPreflight(): string {
  return `${wagoShellRootDirectoryCheck()}
wago_require_root_directory "$root/dev" || { echo 'Unsafe serial device directory' >&2; exit 1; }
test -L "$root${CC100_SERIAL_PATH}" &&
  test "$(stat -c '%u:%g' "$root${CC100_SERIAL_PATH}")" = 0:0 &&
  test "$(readlink -f "$root${CC100_SERIAL_PATH}")" = "$root${CC100_SERIAL_HOST_PATH}" &&
  test -c "$root${CC100_SERIAL_HOST_PATH}" && test ! -L "$root${CC100_SERIAL_HOST_PATH}" || {
  echo 'CC100 RS-485 device unavailable or unexpected' >&2; exit 1;
}
wago_serial_gid=$(awk -F: '$1 == "dialout" { count++; if (NF != 4 || $3 !~ /^[0-9]+$/) bad=1; gid=$3 }
  END { if (count != 1 || bad) exit 1; print gid }' "$root/etc/group") || {
  echo 'CC100 serial access group unavailable' >&2; exit 1;
}
test "$(stat -c '%u:%g:%a' "$root${CC100_SERIAL_HOST_PATH}")" = "0:$wago_serial_gid:660" || {
  echo 'Unexpected CC100 serial device ownership or permissions' >&2; exit 1;
}
test -f "$root/sys/class/tty/ttySTM1/device/of_node/linux,rs485-enabled-at-boot-time" || {
  echo 'CC100 RS-485 boot configuration unavailable' >&2; exit 1;
}
`;
}
