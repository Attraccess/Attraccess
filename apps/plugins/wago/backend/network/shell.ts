import { wagoRuntimeSupervisorLaunchShell } from '../runtime/supervisor';
import { boundedReceiver } from '../runtime/update/shell';
import { wagoShellFilesystemGuard } from '../host/shell/filesystem';

export const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

/** Fixed program run using Node from the installed image, never supplied by an SSH
 * client. The temporary container has no hardware or network access. Only this
 * program can use the local Docker API; its input is bounded, validated JSON.
 * Docker's create API preserves Config/HostConfig, unlike reconstructing a subset
 * of docker run flags. No command, image, mount or device comes from the request.
 */
export const networkChangeDeviceProgram = String.raw`
const fs = require('node:fs');
const http = require('node:http');
const crypto = require('node:crypto');
const tx = '/transaction', config = '/configuration', data = '/data';
function fail() { throw new Error('network_change'); }
function regular(path, max = 1048576) {
  const fd = fs.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const s = fs.fstatSync(fd);
    if (!s.isFile() || s.nlink !== 1 || s.size > max) fail();
    return fs.readFileSync(fd, 'utf8');
  } finally { fs.closeSync(fd); }
}
function atomic(path, value, uid = 0, mode = 0o600) {
  const next = path + '.' + crypto.randomBytes(8).toString('hex');
  const fd = fs.openSync(next, 'wx', 0o600);
  try { fs.writeFileSync(fd, value); fs.fchmodSync(fd, mode); fs.fchownSync(fd, uid, uid); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  fs.renameSync(next, path);
  const parent = fs.openSync(require('node:path').dirname(path), 'r');
  try { fs.fsyncSync(parent); } finally { fs.closeSync(parent); }
}
function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const bytes = body === undefined ? '' : JSON.stringify(body);
    const req = http.request({ socketPath: '/var/run/docker.sock', path, method,
      headers: {'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bytes)} }, res => {
      let result = '';
      res.on('data', c => { result += c; if (result.length > 1048576) req.destroy(new Error('bounded')); });
      res.on('end', () => resolve({ code: res.statusCode, body: result ? JSON.parse(result) : null }));
    });
    req.on('error', reject);
    req.setTimeout(40000, () => req.destroy(new Error('timeout')));
    req.end(bytes);
  });
}
async function apply() {
  const input = JSON.parse(regular(tx + '/payload', 65536));
  if (input.schema !== 1 || !/^[a-f0-9]{32}$/.test(input.operationToken) ||
      !/^[A-Za-z0-9_-]{43}$/.test(input.token) || !/^[a-f0-9-]{36}$/.test(input.credentialEpoch) ||
      typeof input.hardwareId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(input.hardwareId) ||
      input.username !== 'wago-controller-' + input.hardwareId ||
      typeof input.password !== 'string' || !input.password || input.password.length > 4096 || /[\r\n\0]/.test(input.password) ||
      typeof input.prefix !== 'string' || !input.prefix || input.prefix.length > 128 || /[+#\r\n\0]/.test(input.prefix) || input.prefix.split('/').some(p => !p) ||
      !/^mqtts?:\/\/[A-Za-z0-9.-]+:[0-9]{1,5}$/.test(input.url) ||
      typeof input.tlsInsecure !== 'boolean' || typeof input.caCert !== 'string' || input.caCert.length > 32768 ||
      typeof input.tlsServername !== 'string' || !/^[A-Za-z0-9.-]*$/.test(input.tlsServername)) fail();
  const [original] = JSON.parse(regular(tx + '/container.json'));
  const env = original.Config.Env;
  if (!Array.isArray(env) || env.find(e => e.startsWith('WAGO_HARDWARE_ID=')) !== 'WAGO_HARDWARE_ID=' + input.hardwareId ||
      !/^sha256:[a-f0-9]{64}$/.test(original.Image) || original.HostConfig.RestartPolicy.Name !== 'no' ||
      !original.Mounts.some(m => m.Type === 'bind' && m.Destination === '/var/lib/attraccess-wago' && m.RW) ||
      env.some(e => e.startsWith('WAGO_STATE_PATH=') && e !== 'WAGO_STATE_PATH=/var/lib/attraccess-wago/state.json')) fail();
  const state = JSON.parse(regular(data + '/state.json'));
  if (!state.credentials || state.credentials.username !== input.username ||
      (state.credentials.prefix && state.credentials.prefix !== input.prefix)) fail();
  const updates = {
    WAGO_MQTT_URL: input.url, WAGO_MQTT_USERNAME: input.username, WAGO_MQTT_PASSWORD: input.password,
    WAGO_MQTT_PREFIX: input.prefix, WAGO_MQTT_USE_ENV_CREDENTIALS: 'false',
    WAGO_MQTT_TLS_INSECURE: input.tlsInsecure ? 'true' : undefined,
    WAGO_MQTT_TLS_SERVERNAME: input.tlsServername || undefined,
    NODE_EXTRA_CA_CERTS: input.caCert ? '/var/lib/attraccess-wago/mqtt-ca.pem' : undefined,
  };
  function environment(lines) {
    return [...lines.filter(e => e && !Object.hasOwn(updates, e.split('=', 1)[0])),
      ...Object.entries(updates).filter(([,v]) => v !== undefined).map(([k,v]) => k + '=' + v)];
  }
  // Only broker identity fields change. Accepted configuration, outputs, pulse
  // obligations, command deduplication and sequence counters survive byte-for-byte
  // as JSON values. Runtime loads these durable credentials again after reboot.
  state.credentials = { ...state.credentials, username: input.username, password: input.password,
    prefix: input.prefix, credentialEpoch: input.credentialEpoch };
  state.credentialRotation = { revision: 1, token: input.token };
  atomic(data + '/state.json', JSON.stringify(state), 10001);
  atomic(config + '/runtime.env', environment(regular(config + '/runtime.env').split('\n')).join('\n') + '\n');
  if (input.caCert) atomic(config + '/runtime-ca.pem', input.caCert, 0, 0o444);
  const spec = { ...original.Config, Image: original.Image, Env: environment(env),
    Labels: { ...original.Config.Labels, 'io.attraccess.wago.network-token': input.operationToken },
    HostConfig: { ...original.HostConfig } };
  if (input.caCert && !(spec.HostConfig.Binds || []).some(b => b.split(':')[1] === '/var/lib/attraccess-wago/mqtt-ca.pem')) {
    const stateBind = spec.HostConfig.Binds.find(b => b.split(':')[1] === '/var/lib/attraccess-wago');
    if (!stateBind) fail();
    // Configuration and state are adjacent fixed host paths, captured from the
    // original installation; the API request cannot choose a host mount source.
    const caSource = regular(tx + '/ca-source', 1024).trim();
    if (!caSource.endsWith('/etc/attraccess-wago/runtime-ca.pem')) fail();
    spec.HostConfig.Binds = [...spec.HostConfig.Binds, caSource + ':/var/lib/attraccess-wago/mqtt-ca.pem:ro'];
  }
  // Preserve explicitly configured network attachments; omit observed dynamic IPs.
  if (!['host', 'none', 'default'].includes(spec.HostConfig.NetworkMode)) {
    spec.NetworkingConfig = { EndpointsConfig: Object.fromEntries(Object.entries(original.NetworkSettings.Networks || {})
      .map(([name,n]) => [name, { IPAMConfig: n.IPAMConfig, Links: n.Links, Aliases: n.Aliases, DriverOpts: n.DriverOpts }])) };
  }
  const current = await request('GET', '/containers/attraccess-wago/json');
  if (current.code === 200) {
    if (current.body.State.Running) fail();
    if (current.body.Config.Labels?.['io.attraccess.wago.network-token'] === input.operationToken && current.body.Image === original.Image) return;
    if (current.body.Id !== original.Id) fail();
    if ((await request('DELETE', '/containers/' + original.Id)).code !== 204) fail();
  } else if (current.code !== 404) fail();
  if ((await request('POST', '/containers/create?name=attraccess-wago', spec)).code !== 201) fail();
}
apply().catch(() => { process.stderr.write('MQTT recreation requires recovery\n'); process.exitCode = 1; });
`;

/** Parameters come from the helper's fixed header; the stream contains data only. */
export function networkChangeShell(action: 'apply' | 'ack' | 'release', testRoot = ''): string {
  return `(
set -eu
umask 077
root=${quote(testRoot)}
config="$root/etc/attraccess-wago"
data="$root/var/lib/attraccess-wago"
tx="$root/var/lib/attraccess-wago-network-transaction"
receipt="$root/var/lib/attraccess-wago-network-completed"
hook="$root/etc/rc.d/S99_zz_attraccess_wago"
fail() { echo "$*" >&2; exit 1; }
${wagoShellFilesystemGuard({ waitForLock: true, createConfiguration: false })}
wago_require_root_directory_or_alias "$root/var/lib" || fail 'Unsafe network journal parent'
test "$(cat "$root/etc/attraccess-wago-management/token")" = "$token" || fail 'Foreign management token'
case "$digest" in ''|*[!a-f0-9]*) exit 1 ;; esac
test "\${#digest}" = 64 || exit 1
for path in "$root/var/lib/attraccess-wago-update-transaction" "$root/var/lib/attraccess-wago-install-transaction" "$config/delivery" "$config/docker-provision"; do
  test ! -e "$path" && test ! -L "$path" || fail 'Runtime recovery or acceptance required'
done
for path in "$root/var/lib"/attraccess-wago-update-cleanup-*; do test ! -e "$path" && test ! -L "$path" || fail 'Runtime cleanup required'; done
require_journal() {
  test -d "$tx" && test ! -L "$tx" && test "$(stat -c '%u:%g:%a' "$tx")" = 0:0:700 || fail 'Unsafe network journal'
  for field in digest payload container.json ca-source; do
    test -f "$tx/$field" && test ! -L "$tx/$field" && test "$(stat -c '%u:%g:%a:%h' "$tx/$field")" = 0:0:600:1 || fail 'Unsafe network metadata'
  done
  test "$(cat "$tx/digest")" = "$digest" || fail 'Foreign network transaction'
  printf '%s  %s\\n' "$digest" "$tx/payload" | sha256sum -c - >/dev/null || fail 'MQTT payload checksum mismatch'
}
${
  action !== 'apply'
    ? `
${
  action === 'release'
    ? `
# The backend saved the replacement before requesting this release. A retry
# after the new apply began must retain its journal, even if recreation stopped
# between DELETE and CREATE. Unknown journals are never discarded.
case "$bytes" in ''|*[!a-f0-9]*) exit 1 ;; esac
test "\${#bytes}" = 64 && test "$bytes" != "$digest" || exit 1
if test -e "$tx" || test -L "$tx"; then
  test -d "$tx" && test ! -L "$tx" && test "$(stat -c '%u:%g:%a' "$tx")" = 0:0:700 || fail 'Unsafe network journal'
  test -f "$tx/digest" && test ! -L "$tx/digest" && test "$(stat -c '%u:%g:%a:%h' "$tx/digest")" = 0:0:600:1 && test "$(stat -c '%s' "$tx/digest")" -le 65 || fail 'Unsafe network digest'
  if test "$(cat "$tx/digest")" = "$bytes"; then
    digest="$bytes"; require_journal; printf 'OK\\n'; exit 0
  fi
fi
`
    : ''
}
if test ! -e "$tx" && test ! -L "$tx"; then
  test -f "$receipt" && test ! -L "$receipt" && test "$(stat -c '%u:%g:%a:%h' "$receipt")" = 0:0:600:1 && test "$(cat "$receipt")" = "$digest" || fail 'Network acknowledgement unavailable'
else
  require_journal
  next=$(mktemp "$root/var/lib/.attraccess-network-receipt.XXXXXX")
  printf '%s\\n' "$digest" > "$next"; sync; mv -f "$next" "$receipt"; sync
  rm -rf "$tx"; sync
fi
printf 'OK\\n'
`
    : `
case "$bytes" in ''|*[!0-9]*) exit 1 ;; esac
test "\${#bytes}" -le 5 && test "$bytes" -gt 0 && test "$bytes" -le 65536 || exit 1
docker() { timeout -k 5 45 docker --host unix:///var/run/docker.sock "$@"; }
if test ! -e "$tx" && test ! -L "$tx"; then
  stage=$(mktemp -d "$root/var/lib/attraccess-wago-network-stage.XXXXXX")
  trap 'rm -rf "$stage"' EXIT
  timeout -k 5 30 sh -c ${quote(boundedReceiver)} sh "$stage/payload" "$((bytes + 1))" "$wago_stat_mode" || fail 'MQTT payload transfer failed'
  test "$(stat -c '%s' "$stage/payload")" = "$bytes" || fail 'MQTT payload size mismatch'
  printf '%s  %s\\n' "$digest" "$stage/payload" | sha256sum -c - >/dev/null || fail 'MQTT payload checksum mismatch'
  docker inspect attraccess-wago > "$stage/container.json"
  printf '%s\\n' "$config/runtime-ca.pem" > "$stage/ca-source"
  printf '%s\\n' "$digest" > "$stage/digest"
  sync; mv "$stage" "$tx"; sync
  trap - EXIT
else
  # Consume and verify retries, never silently ignore changed credentials.
  stage=$(mktemp "$config/.network-retry.XXXXXX")
  trap 'rm -f "$stage"' EXIT
  timeout -k 5 30 sh -c ${quote(boundedReceiver)} sh "$stage" "$((bytes + 1))" "$wago_stat_mode" || fail 'MQTT payload transfer failed'
  test "$(stat -c '%s' "$stage")" = "$bytes" || fail 'MQTT payload size mismatch'
  printf '%s  %s\\n' "$digest" "$stage" | sha256sum -c - >/dev/null || fail 'MQTT payload checksum mismatch'
  rm -f "$stage"; trap - EXIT
fi
require_journal
test -d "$data" && test ! -L "$data" && test "$(stat -c '%u:%g:%a' "$data")" = 10001:10001:700 || fail 'Unsafe enrolled runtime state'
test -f "$config/runtime.env" && test ! -L "$config/runtime.env" && test "$(stat -c '%u:%g:%a:%h' "$config/runtime.env")" = 0:0:600:1 || fail 'Unsafe runtime environment'
test ! -L "$config/runtime-ca.pem" || fail 'Unsafe MQTT trust path'
# Disable supervisor starts before stopping. On interruption the durable journal
# and disabled runtime prevent a boot with partially changed broker settings.
rm -f "$config/runtime-enabled"
sync
if docker container ls -a --filter 'name=^/attraccess-wago$' --format '{{.ID}}' | grep -q .; then
  docker stop attraccess-wago >/dev/null
  test "$(docker inspect --format '{{.State.Running}}' attraccess-wago)" = false || fail 'Runtime stop unverified'
fi
# The journal captures the immutable image before any removal, including retries
# after an interruption between DELETE and CREATE.
if test ! -f "$tx/image-id"; then
  docker inspect --format '{{.Image}}' attraccess-wago > "$tx/image-id"; sync
fi
image_id=$(cat "$tx/image-id")
case "$image_id" in sha256:*) ;; *) fail 'Invalid runtime image' ;; esac
value=\${image_id#sha256:}; test "\${#value}" = 64 || fail 'Invalid runtime image'
case "$value" in *[!a-f0-9]*) fail 'Invalid runtime image' ;; esac
timeout -k 5 300 docker --host unix:///var/run/docker.sock run --rm -i --pull=never --network none --read-only --cap-drop ALL --cap-add CHOWN --cap-add DAC_OVERRIDE --user 0 --entrypoint node \
  -v "$tx:/transaction" -v "$config:/configuration" -v "$data:/data" -v /var/run/docker.sock:/var/run/docker.sock \
  "$image_id" - <<'ATTRACCESS_NETWORK_PROGRAM'
${networkChangeDeviceProgram}
ATTRACCESS_NETWORK_PROGRAM
sync
touch "$config/runtime-enabled"
sync
${wagoRuntimeSupervisorLaunchShell()}
test "$(docker inspect --format '{{.State.Running}}' attraccess-wago)" = true || fail 'Runtime start unverified'
printf 'OK\\n'
`
}
)`;
}
