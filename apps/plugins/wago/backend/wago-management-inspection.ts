import type { ManagementInspection } from './wago-management.types';

/** Public evidence ledger, reviewed 2026-09-05. These sources are NOT CC100 FW31 qualification.
 * WAGO release identity: https://downloadcenter.wago.com/latest/firmware-cc (4.9.1(31)).
 * https://github.com/WAGO/cc100-firmware-sdk documents SSH/HTTPS defaults, not a minimum-privilege profile.
 * https://github.com/WAGO/pfc-howtos/tree/master/HowTo_AddUserOrGroup and
 * https://github.com/WAGO/pfc-howtos/tree/master/HowTo_SplitAdminUser concern PFC/FW20;
 * they do not establish CC100 FW31 user/service commands or WBM/Linux identity equivalence.
 * https://man.openbsd.org/sshd.8 documents ~/.ssh/authorized_keys and permissions.
 * https://man.openbsd.org/sshd_config.5 documents OpenSSH controls, NOT WAGO reload/persistence.
 * https://github.com/mkj/dropbear/blob/master/src/runopts.h distinguishes Dropbear controls.
 * https://www.kernel.org/doc/html/latest/networking/proc_net_tcp.html documents socket observations.
 * Repository: docs/en/devices/wago-cc100-commissioning.md, especially Current release limitations.
 * No config_sshd/config_dropbear invocation, service reload, useradd/sudo profile, WBM mutation,
 * password/default-account disable or reboot-safe watchdog is claimed qualified here.
 */
export const MANAGEMENT_EVIDENCE = Object.freeze({
  firmware: 'https://downloadcenter.wago.com/latest/firmware-cc',
  accounts: 'https://github.com/WAGO/pfc-howtos/tree/master/HowTo_AddUserOrGroup',
  wbmIdentity: 'https://github.com/WAGO/pfc-howtos/tree/master/HowTo_SplitAdminUser',
  keys: 'https://man.openbsd.org/sshd.8',
});

/** Constant, read-only commands. Never source os-release, read shadow/private keys, inspect
 * process arguments (which may contain passwords), run init scripts, or probe remote sockets.
 * Recognize a running daemon via /proc comm, not mere presence of an installed binary.
 * Emit only tags/ports, never process arguments, addresses, usernames or raw config.
 */
export const MANAGEMENT_INSPECTION_COMMAND = String.raw`set -eu
printf 'BEGIN=1\n'
if [ -r /etc/os-release ]; then
  awk -F= '($1 == "NAME" || $1 == "PRETTY_NAME") && $2 ~ /CC100/ { print "MODEL=cc100" }
    $1 == "VERSION_ID" || $1 == "VERSION" {gsub(/"/, "", $2); if ($2 == "31" || $2 == "4.9.1(31)" || $2 == "04.09.01(31)") print "FW=31"; else if ($2 == "2024.12.0") print "FW=bsp_only"; else if ($1 == "VERSION_ID") print "FW=unrecognized"}' /etc/os-release
fi
printf 'UID=%s\n' "$(id -u)"
for comm in /proc/[0-9]*/comm; do
  [ -r "$comm" ] || continue
  IFS= read -r name < "$comm" || continue
  case "$name" in sshd|sshd-session|sshd-auth) printf 'SSH=openssh\n';; dropbear) printf 'SSH=dropbear\n';; esac
done
if [ -r /proc/1/comm ]; then
  IFS= read -r init < /proc/1/comm || init=unknown
  if [ "$init" = systemd ] && command -v systemctl >/dev/null 2>&1; then printf 'CONTROL=systemd\n'
  elif [ "$init" = init ] && [ -d /etc/init.d ]; then printf 'CONTROL=sysv\n'; fi
fi
for family in tcp tcp6 udp udp6; do
  if [ -r "/proc/net/$family" ]; then
    printf 'SOCKETS=%s\n' "$family"
    awk -v family="$family" 'NR > 1 && (($4 == "0A" && family ~ /^tcp/) || (family ~ /^udp/ && $4 == "07")) {split($2, a, ":"); print "PORT=" a[2]}' "/proc/net/$family"
  fi
done
printf 'END=1\n'`;

export function parseManagementInspection(output: string): ManagementInspection {
  if (Buffer.byteLength(output) > 16384 || !output.startsWith('BEGIN=1\n') || !output.endsWith('END=1\n'))
    throw new Error('inspection_failed');
  const lines = new Set(output.trim().split('\n'));
  const recognized = [...lines].every((line) =>
    /^(BEGIN=1|END=1|MODEL=cc100|FW=(31|unrecognized|bsp_only)|UID=\d{1,10}|SSH=(openssh|dropbear)|CONTROL=(systemd|sysv)|SOCKETS=(tcp6?|udp6?)|PORT=[A-Fa-f0-9]{4})$/.test(
      line,
    ),
  );
  if (!recognized) throw new Error('inspection_failed');
  const uidLines = [...lines].filter((line) => line.startsWith('UID='));
  const uid = uidLines.length === 1 ? Number(uidLines[0].slice(4)) : null;
  const complete = ['tcp', 'tcp6', 'udp', 'udp6'].every((family) => lines.has(`SOCKETS=${family}`));
  const ports = [...lines].filter((line) => line.startsWith('PORT=')).map((line) => parseInt(line.slice(5), 16));
  const openssh = lines.has('SSH=openssh'),
    dropbear = lines.has('SSH=dropbear');
  return {
    model: lines.has('MODEL=cc100') ? 'cc100' : 'unknown',
    firmware: lines.has('FW=31')
      ? lines.has('FW=unrecognized')
        ? 'unknown'
        : '31'
      : lines.has('FW=unrecognized')
        ? 'unsupported'
        : 'unknown',
    ssh: openssh && dropbear ? 'mixed' : openssh ? 'openssh' : dropbear ? 'dropbear' : 'unknown',
    serviceControl:
      lines.has('CONTROL=systemd') && !lines.has('CONTROL=sysv')
        ? 'systemd'
        : lines.has('CONTROL=sysv') && !lines.has('CONTROL=systemd')
          ? 'sysv'
          : 'unknown',
    uid: uid !== null && Number.isSafeInteger(uid) && uid <= 4294967294 ? uid : null,
    wbm: ports.some((port) => port === 80 || port === 443) ? 'listening' : complete ? 'not_observed' : 'unknown',
    // Include every non-SSH listener. A custom WBM port remains an unclassified exposure.
    otherManagement: ports.some((port) => ![22, 80, 443].includes(port))
      ? 'listening'
      : complete
        ? 'not_observed'
        : 'unknown',
    networkScope: 'local_socket_observation',
    passwordAccess: 'unknown',
    defaultAccess: 'unknown',
  };
}
