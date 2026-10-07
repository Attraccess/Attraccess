import { wagoShellStat } from './wago-shell-stat';
import { preamble } from './wago-runtime-install.preamble';
export function boundedDocker(): string {
  return 'docker() { timeout -k 5 45 docker --host unix:///var/run/docker.sock "$@"; }';
}
export function quote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export /**
 * Read-only capacity/tool checks. Staging is checked before preparation; the full
 * check requires activated Docker on its local socket and never guesses its root.
 *
 * B is the authenticated, plain outer tar size (bounds the extracted image.tar).
 * Peak phases: upload E=B; move E=B,T=B (even equal st_dev can be bind mounts);
 * extraction/load T=B,V=B,D=3B. Sum by st_dev, then take the phase maximum,
 * adding 16 MiB once per filesystem for configuration/journals and headroom.
 * No credit is taken for deleting old state, cached layers, or existing uploads.
 *
 * The retained Docker 3B reserve is an admission policy, NOT an expansion bound:
 * compressed/sparse layers and filesystem metadata can exceed it. A verified
 * image expansion bound is needed before claiming guaranteed Docker capacity.
 */
function bundleCapacityPreflightScript(
  bytes: number,
  testRoot: string,
  includeDocker: boolean,
  helperParameters = false,
  reportOnly = false,
  update = false,
): string {
  if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > 512 * 1024 * 1024) throw new Error('Invalid bundle size');
  if (testRoot && (!testRoot.startsWith('/') || testRoot === '/' || testRoot.includes('\n')))
    throw new Error('Test root must be an absolute isolated directory');
  return `set -eu
export LC_ALL=C
unset DOCKER_HOST DOCKER_CONTEXT DOCKER_TLS_VERIFY DOCKER_CERT_PATH
fail() { echo "$*" >&2; exit 1; }
for tool in flock ${includeDocker ? 'docker ' : ''}timeout sha256sum base64 tar grep awk stat dd df nohup mktemp cat cp mv chmod chown rm mkdir touch wc tr sed; do
  command -v "$tool" >/dev/null || fail "Runtime tool unavailable: $tool"
done
tar --version | grep -q 'GNU tar'
${wagoShellStat()}
${
  includeDocker
    ? `${boundedDocker()}
docker_root=$(docker info --format '{{.DockerRootDir}}')
case "$docker_root" in /*) ;; *) fail 'Invalid Docker storage root' ;; esac`
    : ''
}
storage_rows=
storage_config=${quote(testRoot + '/etc/attraccess-wago')}
if test ! -e "$storage_config"; then storage_config=${quote(testRoot + '/etc')}; fi
for storage_path in ${update ? quote(testRoot + '/var/lib') : `"$storage_config" ${['/tmp', '/var/lib'].map((path) => quote(testRoot + path)).join(' ')}`}${includeDocker ? ' "$docker_root"' : ''}; do
  test -d "$storage_path" || fail "Missing storage directory: $storage_path"
  storage_identity=$(stat -Lc '%d:%i' "$storage_path") || fail 'Cannot identify storage filesystem'
  storage_device=\${storage_identity%%:*}
  case "$storage_device" in ''|*[!0-9]*) fail 'Invalid storage filesystem identity' ;; esac
  # Capture df separately: a pipeline must not hide a failed df exit status.
  storage_df=$(df -Pk "$storage_path") || fail "Cannot read storage capacity: $storage_path"
  storage_free=$(printf '%s\\n' "$storage_df" | awk '
    NR == 1 { if ($1 != "Filesystem") bad=1; next }
    NR == 2 { if (NF != 6 || $2 !~ /^[0-9]+$/ || $3 !~ /^[0-9]+$/ || $4 !~ /^[0-9]+$/ || $5 !~ /^[0-9]+%$/ || $4 + 0 > $2 + 0 || length($4) > 12) bad=1; free=$4; next }
    { bad=1 }
    END { if (bad || NR != 2) exit 1; print free }
  ') || fail "Invalid df output: $storage_path"
  storage_mount=$(printf '%s\n' "$storage_df" | awk 'NR==2 {print $1, $6}')
  storage_rows="$storage_rows$storage_device $storage_free $storage_path $storage_mount
"
done
printf '%s' "$storage_rows" | awk -v update=${update ? 1 : 0} -v report=${reportOnly ? 1 : 0} -v b=${helperParameters ? '"$kib"' : Math.ceil(bytes / 1024)} '
  { dev[NR]=$1; available[NR]=$2; path[NR]=$3; filesystem[NR]=$4; mount[NR]=$5 }
  END {
    for (i=1; i<=NR; i++) {
      # Equal st_dev does not rule out EXDEV between distinct bind mounts.
      move=(dev[i]==dev[1] ? b : 0)+(dev[i]==dev[2] ? b : 0)
      load=(dev[i]==dev[2] ? b : 0)+(dev[i]==dev[3] ? b : 0)+(NR==4 && dev[i]==dev[4] ? 3*b : 0)
      required=(move>load ? move : load)+16384
      # Direct updates retain one verified bundle and stream its inner archive.
      # Docker keeps the same 3B admission reserve; sum on shared filesystems.
      if (update) required=(dev[i]==dev[1] ? b : 0)+(dev[i]==dev[2] ? 3*b : 0)+16384
      if (report) { printf "%s %.0f %.0f %s %s\\n", path[i], available[i], required, filesystem[i], mount[i]; continue }
      if (available[i]<required) {
        printf "Insufficient runtime storage: %s requires %.0f KiB, available %.0f KiB\\n", path[i], required, available[i]
        bad=1
      }
    }
    exit bad
  }
' ${reportOnly ? '' : '>&2'}
`;
}

/** Call only after the coordinator accepts the new runtime; discards recovery metadata. */
export function runtimeBundleAcceptScript(testRoot = '', locked = false): string {
  return `${preamble(testRoot, locked, true)}
test ! -e "$cleanup" || fail 'Recovery cleanup is pending; acceptance is unavailable'
if [ -d "$acceptedCleanup" ]; then rm -rf "$acceptedCleanup"; exit 0; fi
test -f "$tx/started" || fail 'No started runtime transaction to accept'
test ! -e "$tx/recovering" || fail 'Recovery already began; finish recovery instead of acceptance'
validate_snapshot || fail 'Incomplete runtime transaction metadata'
test -f "$config/runtime-enabled" && test ! -L "$config/runtime-enabled" || fail 'Runtime is not enabled'
test "$(docker inspect --format '{{.State.Running}}' attraccess-wago)" = true || fail 'Runtime is not running; retain the transaction for recovery'
touch "$tx/accepting"
mv "$tx" "$acceptedCleanup"
rm -rf "$acceptedCleanup"
`;
}

/** After activation: recheck staging and the discovered Docker root together. */
export function runtimeBundleCapacityPreflightScript(bytes: number, testRoot = '', helperParameters = false): string {
  return bundleCapacityPreflightScript(bytes, testRoot, true, helperParameters);
}
