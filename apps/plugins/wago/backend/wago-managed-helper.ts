import { commissioningAcceptanceScript } from './wago-commissioning-accept';
import { runtimeUpdateCapacityPreflightScript } from './wago-runtime-install';
import type { BuildRuntimeArtifact } from './wago-build-runtime';
import {
  runtimeUpdateStageScript,
  runtimeUpdateActivateScript,
  runtimeUpdateAcceptScript,
  runtimeUpdateRollbackScript,
  runtimeUpdateAcknowledgeScript,
} from './wago-runtime-update-shell';
import { wagoShellFilesystemGuard } from './wago-shell-filesystem';
import { MANAGED_HELPER_PROTOCOL, managedInstallerPublishScript } from './wago-managed-installer';
import {
  managedCutoverScript,
  managedCommitScript,
  managedRestoreScript,
  managedKeyCommitScript,
  managedRetireScript,
  managedRebootScript,
} from './wago-managed-provision';

const tokenExample = 'a'.repeat(32);
const previousExample = `sha256:${'b'.repeat(64)}`;
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

/** Fixed protocol v1 executor. It never evaluates client commands/scripts or extracts
 * executable code from a bundle. SSH's forced command and sudo both name this file.
 * Supported installer contracts are compiled here; unknown profiles fail closed.
 */
export function managedHostHelper(artifact: BuildRuntimeArtifact, testRoot = ''): string {
  if (testRoot && (!testRoot.startsWith('/') || testRoot === '/' || /[\n']/.test(testRoot)))
    throw new Error('Invalid isolated helper root');
  const stage = runtimeUpdateStageScript(artifact, tokenExample, testRoot, true);
  const profile = artifact.manifest.hardware.profile;
  const update = (script: string) => `(${script})`;
  return `#!/bin/sh
set -eu
umask 077
PATH=${testRoot ? quote(testRoot + '/bin') : '/usr/sbin:/usr/bin:/sbin:/bin'}
export PATH
unset ENV BASH_ENV CDPATH DOCKER_HOST DOCKER_CONTEXT DOCKER_TLS_VERIFY DOCKER_CERT_PATH
test "$(id -u)" = 0 || exit 1
test "$#" = 0 || exit 1
IFS=' ' read -r action token digest bytes image reference previous extra
test -z "$extra" || exit 1
case "$token" in ''|*[!a-f0-9]*) exit 1 ;; esac
test "\${#token}" = 32 || exit 1
case "$action" in proof) test "$digest$bytes$image$reference$previous" = '' || exit 1; printf 'OK %s\\n' "$token"; exit 0 ;; esac
config=${quote(testRoot + '/etc/attraccess-wago')}
root=${quote(testRoot)}
fail() { exit 1; }
${wagoShellFilesystemGuard({ acquireLock: false, createConfiguration: false })}
case "$action" in
  access-boot)
    test "$digest$bytes$image$reference$previous" = '' || exit 1
    test "$(cat ${quote(testRoot + '/etc/attraccess-wago-management/token')})" = "$token"
    cat ${quote(testRoot + '/proc/sys/kernel/random/boot_id')}; exit 0 ;;
  access-policy)
    test "$digest$bytes$image$reference$previous" = '' || exit 1
    test "$(cat ${quote(testRoot + '/etc/attraccess-wago-management/token')})" = "$token"
    pid=$(cat ${quote(testRoot + '/var/run/dropbear.pid')})
    case "$pid" in ''|0|*[!0-9]*) exit 1 ;; esac
    test "\${#pid}" -le 10 || exit 1
    test "$(readlink ${quote(testRoot + '/proc')}/"$pid"/exe)" = "$(readlink -f ${quote(testRoot + '/usr/sbin/dropbear')})" || exit 1
    tr '\\000' '\\n' < ${quote(testRoot + '/proc')}/"$pid"/cmdline | awk '
      previous == "-G" {group=$0}
      $0 == "-G" {g++} $0 == "-w" {w++} $0 == "-s" {s++}
      {previous=$0}
      END {exit !(g==1 && w==1 && s==1 && group=="attraccess")}' || exit 1
    listeners=$(awk '$2 ~ /:0016$/ && $4 == "0A" {print $10}' ${quote(testRoot + '/proc/net/tcp')} ${quote(testRoot + '/proc/net/tcp6')})
    test -n "$listeners" || exit 1
    for inode in $listeners; do
      found=0
      for fd in ${quote(testRoot + '/proc')}/"$pid"/fd/*; do
        if test "$(readlink "$fd" 2>/dev/null || :)" = "socket:[$inode]"; then found=1; fi
      done
      test "$found" = 1 || exit 1
    done
    printf 'OK\\n'; exit 0 ;;
  access-status)
    test "$digest$bytes$image$reference$previous" = '' || exit 1
    base=${quote(testRoot + '/etc/attraccess-wago-management')}
    test "$(cat "$base/token")" = "$token"
    if test -f "$base/committed" && test "$(cat "$base/committed")" = "$token"; then printf 'committed\\n';
    elif test -f "$base/cutover"; then printf 'cutover\\n'; else printf 'open\\n'; fi
    exit 0 ;;
  access-key-commit|access-cutover|access-commit|access-restore|access-retire|access-reboot)
    test "$digest$bytes$image$reference$previous" = '' || exit 1
    case "$action" in
      access-key-commit) ${update(managedKeyCommitScript(tokenExample, testRoot, true))} ;;
      access-cutover) ${update(managedCutoverScript(tokenExample, testRoot, true))} ;;
      access-commit) ${update(managedCommitScript(tokenExample, testRoot, true))} ;;
      access-restore) ${update(managedRestoreScript(tokenExample, testRoot, true))} ;;
      access-retire) ${update(managedRetireScript(tokenExample, testRoot, true))} ;;
      access-reboot) ${update(managedRebootScript(tokenExample, testRoot, true))} ;;
    esac
    exit 0 ;;
  commissioning-accept)
    test "$digest$bytes$image$reference$previous" = '' || exit 1
    ${commissioningAcceptanceScript(tokenExample, testRoot, true)}
    exit 0 ;;
esac
case "$action" in
  installer-publish) ${managedInstallerPublishScript(testRoot)}
    exit 0 ;;
  receiver-status)
    test "$digest$bytes$image$reference$previous" = '' || exit 1
    test "$(cat ${quote(testRoot + '/etc/attraccess-wago-management/token')})" = "$token" || exit 1
    # Read-only compatibility evidence for older helpers using head -c.
    if sample=$(printf x | timeout -k 5 10 head -c 1 2>/dev/null) && test "$sample" = x; then
      printf 'head-byte-count supported\\n'
    else printf 'head-byte-count unsupported\\n'; fi ;;
  storage-status)
    test "$digest$bytes$image$reference$previous" = '' || exit 1
    test "$(cat ${quote(testRoot + '/etc/attraccess-wago-management/token')})" = "$token" || exit 1
    (${runtimeUpdateCapacityPreflightScript(artifact.bytes, testRoot, false, true)}
    # Inventory only this system's retained upload/journal paths. No pruning.
    for retained in "$root/tmp/attraccess-wago-runtime.tar" "$root/var/lib/attraccess-wago-install-transaction" "$root/var/lib"/attraccess-wago-update-*; do
      if test -e "$retained" || test -L "$retained"; then du -sk "$retained"; fi
    done) ;;
  inspect)
    test "$digest$bytes$image$reference$previous" = '' || exit 1
    # This is a point-in-time read. Ownership was validated above; taking the
    # writer lock here would make a healthy runtime appear offline throughout
    # every hardware gate. Mutating operations acquire their own bounded lock
    # and validate the actual container/journal again before changing anything.
    printf '%s\\n' '${MANAGED_HELPER_PROTOCOL}'
    sha256sum -- ${quote(testRoot + '/usr/sbin/attraccess-wago-management')} | cut -d' ' -f1
    timeout -k 5 45 docker --host unix:///var/run/docker.sock inspect --format '{{.Image}} {{.State.Running}}' attraccess-wago ;;
  stage)
    test -z "$previous" || exit 1
    case "$digest" in ''|*[!a-f0-9]*) exit 1 ;; esac
    test "\${#digest}" = 64 || exit 1
    case "$bytes" in ''|*[!0-9]*) exit 1 ;; esac
    test "\${#bytes}" -le 9 && test "$bytes" -gt 0 && test "$bytes" -le 536870912 || exit 1
    case "$image" in sha256:*) ;; *) exit 1 ;; esac
    value=\${image#sha256:}; test "\${#value}" = 64 || exit 1
    case "$value" in *[!a-f0-9]*) exit 1 ;; esac
    printf '%s\\n' "$reference" | grep -Eq '^ghcr[.]io/attraccess/wago-cc100-runtime(:[A-Za-z0-9_.-]+)?@sha256:[a-f0-9]{64}$' || exit 1
    kib=$(((bytes + 1023) / 1024))
    nohup ${quote(testRoot + '/etc/attraccess-wago-management/update-watchdog')} "$token" </dev/null >/dev/null 2>&1 &
    (${stage}) ;;
  activate|accept|acknowledge)
    test "$digest$bytes$image$reference$previous" = '' || exit 1
    case "$action" in
      activate) ${update(runtimeUpdateActivateScript(tokenExample, profile, testRoot, true))} ;;
      accept) ${update(runtimeUpdateAcceptScript(tokenExample, profile, testRoot, true))} ;;
      acknowledge) ${update(runtimeUpdateAcknowledgeScript(tokenExample, profile, testRoot, true))} ;;
    esac ;;
  recover)
    test "$bytes$image$reference$previous" = '' || exit 1
    previous=$digest
    case "$previous" in sha256:*) ;; *) exit 1 ;; esac
    value=\${previous#sha256:}; test "\${#value}" = 64 || exit 1
    case "$value" in *[!a-f0-9]*) exit 1 ;; esac
    ${update(runtimeUpdateRollbackScript(tokenExample, profile, previousExample, testRoot, true))} ;;
  *) exit 1 ;;
esac
`;
}
