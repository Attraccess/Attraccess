import { wagoFw31IdentityCheck } from './wago-firmware-identity';
import { wagoCodesysClassificationShell } from './wago-codesys-classification';
import { wagoShellStat } from './wago-shell-stat';
import { wagoHostIoGuardShell } from './wago-host-io-guard';
import { wagoPrivilegeProbeShell } from './wago-privilege-probe';
import { rootValue } from './wago-hardware-deployment.root-value.helpers';
import { WAGO_DIN } from './wago-hardware-deployment.state';
import { WAGO_DOUT } from './wago-hardware-deployment.state';
import { WAGO_RUN_LEDS } from './wago-hardware-deployment.state';

export function checks(testRoot: string, boundedDocker = true, inspectHostWriters = true): string {
  return `set -eu
${wagoShellStat()}
root=${rootValue(testRoot)}
# Never inherit a remote Docker context or TCP endpoint from the login shell.
unset DOCKER_HOST DOCKER_CONTEXT DOCKER_TLS_VERIFY DOCKER_CERT_PATH
export DOCKER_HOST=unix:///var/run/docker.sock
docker_cli=$(command -v docker || :)
daemon_cli=$(command -v dockerd || :)
docker() { ${boundedDocker ? 'timeout -k 5 10 "$docker_cli"' : 'command docker'} --host unix:///var/run/docker.sock "$@"; }
config_docker=missing
[ ! -x "$root/etc/config-tools/config_docker" ] || config_docker=present
platform=unsupported-firmware
if test -f "$root/etc/os-release" &&
  ${wagoFw31IdentityCheck(true)}; then platform=supported; fi
din="$root${WAGO_DIN}"
dout="$root${WAGO_DOUT}"
wago_led_green=
wago_led_red=
if test -f "$root${WAGO_RUN_LEDS.green}" && test ! -L "$root${WAGO_RUN_LEDS.green}"; then wago_led_green="$root${WAGO_RUN_LEDS.green}"; fi
if test -f "$root${WAGO_RUN_LEDS.red}" && test ! -L "$root${WAGO_RUN_LEDS.red}"; then wago_led_red="$root${WAGO_RUN_LEDS.red}"; fi
hardware=accessible
if ! test -f "$din" || ! test -f "$dout" || test -L "$din" || test -L "$dout"; then
  hardware=missing-register
else
  ${wagoPrivilegeProbeShell()}
fi
exclusivity=unknown
processes=$(ps -eo comm=) || exit 1
${wagoCodesysClassificationShell()}
codesys_state=$(wago_codesys_classify) || exit 1
if [ "$codesys_state" = active ]; then exclusivity=codesys-active; fi
# WAGO config_runtime/init runtime use S98_runtime. A stopped PLC can return
# at reboot; process absence is not permission to replace its output ownership.
if [ "$exclusivity" = unknown ] && { test -e "$root/etc/rc.d/S98_runtime" || test -L "$root/etc/rc.d/S98_runtime" || test "$(cat "$root/etc/specific/rtsversion" 2>/dev/null || :)" != 0; }; then
  exclusivity=codesys-boot-enabled
fi
docker_state=vendor-package-missing
provision=unsupported-fw31-package-activation
if [ -n "$docker_cli" ] || [ -n "$daemon_cli" ]; then
  docker_state=unsupported-tool-state
  provision=unsupported-tool-state
fi
if [ -n "$docker_cli" ] && [ -n "$daemon_cli" ]; then
  if docker info >/dev/null 2>&1; then
    docker_state=running
    provision=none
    if [ "$exclusivity" = unknown ] && [ "$codesys_state" = inactive ] && [ "$hardware" != missing-register ]; then
      exclusivity=clear
      output_canonical=$(readlink -f "$dout") || exit 1
      containers=$(docker container ls -a --no-trunc --format '{{.ID}}') || exit 1
      for container in $containers; do
        name=$(docker inspect --format '{{.Name}}' "$container") || exit 1
        # The installer stops this exact predecessor under the shared lock.
        [ "$name" != /attraccess-wago ] || continue
        if [ "$name" = /attraccess-wago.previous ]; then
          # A retained update predecessor is exempt only under a root-owned
          # journal matching its full ID, and only while stopped with no restart
          # manager. Names alone must never exempt an additional physical writer.
          update_journal="$root/var/lib/attraccess-wago-update-transaction"
          if test -d "$update_journal" && test ! -L "$update_journal" &&
            test "$(stat -c '%u:%g:%a' "$update_journal")" = 0:0:700 &&
            test -f "$update_journal/previous-id" && test ! -L "$update_journal/previous-id" &&
            test "$(stat -c '%u:%g:%a:%h' "$update_journal/previous-id")" = 0:0:600:1 &&
            test "$(cat "$update_journal/previous-id")" = "$container" &&
            test "$(docker inspect --format '{{.State.Running}}' "$container")" = false &&
            test "$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$container")" = no; then
            continue
          fi
        fi
        privileged=$(docker inspect --format '{{.HostConfig.Privileged}}' "$container") || exit 1
        case "$privileged" in true) exclusivity=output-container-conflict ;; false) ;; *) exit 1 ;; esac
        mounts=$(docker inspect --format '{{range .Mounts}}{{if eq .Type "bind"}}{{.Source}}{{"\\n"}}{{end}}{{end}}' "$container") || exit 1
        conflict=0
        while IFS= read -r source; do
          [ -n "$source" ] || continue
          # Also reject parent binds (including /sys or /) and canonical aliases.
          canonical=$(readlink -f "$source") || exit 1
          case "$output_canonical" in "$canonical"|"$canonical"/*) conflict=1 ;; esac
          [ "$canonical" != / ] || conflict=1
        done <<EOF_MOUNTS
$mounts
EOF_MOUNTS
        [ "$conflict" = 0 ] || exclusivity=output-container-conflict
      done
    fi
    ${
      inspectHostWriters
        ? `if [ "$exclusivity" = clear ]; then
      ${wagoHostIoGuardShell()}
      if ! wago_host_io_guard allow-owned; then exclusivity=unknown; fi
    fi`
        : ''
    }
  elif [ "$platform" = supported ] && [ -x "$root/etc/init.d/dockerd" ]; then
    if ! printf '%s\\n' "$processes" | grep -iq dockerd &&
      test ! -e "$root/var/run/docker.pid" && test ! -L "$root/var/run/docker.pid"; then
      docker_state=installed-stopped
    fi
  fi
fi
if [ "$platform" = supported ] && [ -n "$docker_cli" ] && [ -n "$daemon_cli" ] &&
  [ "$config_docker" = present ] && [ -x "$root/etc/config-tools/get_docker_config" ] &&
  [ -x "$root/etc/config-tools/config_runtime" ] && [ -x "$root/etc/init.d/runtime" ] &&
  [ -x "$root/etc/init.d/dockerd" ]; then
  provision=prepare-controller
  installed=$(${boundedDocker ? 'timeout -k 5 10 ' : ''}"$root/etc/config-tools/get_docker_config" install-status) || exit 1
  case "$installed" in
    installed) ;;
    'not installed') provision=install-vendor-runtime ;;
    *) provision=unsupported-tool-state ;;
  esac
fi
`;
}
