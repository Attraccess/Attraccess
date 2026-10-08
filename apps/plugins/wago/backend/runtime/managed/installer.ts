import { createPublicKey, createSign, generateKeyPairSync } from 'node:crypto';
import { wagoShellFilesystemGuard } from '../../host/shell/filesystem';

export const MANAGED_HELPER_PROTOCOL = 'attraccess-wago-management-v1';

/** This authority is separate from SSH access. Possession of the scoped SSH key
 * alone cannot replace executable host code. Only the server's compiled installer
 * is published; no API accepts installer source or returns this private key.
 */
export function generateInstallerAuthority() {
  return generateKeyPairSync('rsa', {
    modulusLength: 3072,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
}

export function installerPublicKey(privateKey: string): string {
  const key = createPublicKey(privateKey);
  if (key.asymmetricKeyType !== 'rsa' || key.asymmetricKeyDetails?.modulusLength !== 3072)
    throw new Error('Invalid installer authority');
  return key.export({ type: 'spki', format: 'pem' }).toString();
}

export function signInstaller(privateKey: string, token: string, source: string): string {
  installerPublicKey(privateKey);
  return createSign('RSA-SHA256').update(`${token}\n${source}`).sign(privateKey, 'base64');
}

/** A fixed authenticated publication transaction, compatible with FW31's OpenSSL
 * dgst interface. It never runs uploaded code. Atomic replacement happens only
 * after signature, digest, length, syntax and host ownership checks, with no
 * outstanding runtime/cutover transaction. Interrupted publication is retryable.
 */
export function managedInstallerPublishScript(testRoot = ''): string {
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
  return `
test "$reference$previous" = '' || exit 1
case "$digest" in ''|*[!a-f0-9]*) exit 1 ;; esac
test "\${#digest}" = 64 || exit 1
case "$bytes" in ''|*[!0-9]*) exit 1 ;; esac
test "\${#bytes}" -le 7 && test "$bytes" -gt 0 && test "$bytes" -le 2097152 || exit 1
case "$image" in ''|*[!A-Za-z0-9+/=]*) exit 1 ;; esac
test "\${#image}" = 512 || exit 1
${wagoShellFilesystemGuard({ waitForLock: true })}
base=${quote(testRoot + '/etc/attraccess-wago-management')}
test -d "$base" && test ! -L "$base" && test "$(stat -c '%u:%g:%a' "$base")" = 0:0:700 || exit 1
test "$(cat "$base/token")" = "$token" || exit 1
test -f "$base/installer-public.pem" && test ! -L "$base/installer-public.pem" && test "$(stat -c '%u:%g:%a:%h' "$base/installer-public.pem")" = 0:0:600:1 || exit 1
test ! -e "$base/cutover" || test -f "$base/committed" || exit 1
for path in "$root/var/lib/attraccess-wago-update-transaction" "$root/var/lib/attraccess-wago-install-transaction" "$root/var/lib/attraccess-wago-install-transaction.accepted-cleanup" "$config/docker-provision"; do
  test ! -e "$path" && test ! -L "$path" || exit 1
done
wago_require_root_directory_or_alias "$root/usr/sbin" || exit 1
target="$root/usr/sbin/attraccess-wago-management"
test -f "$target" && test ! -L "$target" && test "$(stat -c '%u:%g:%a:%h' "$target")" = 0:0:700:1 || exit 1
available=$(df -Pk "$root/usr/sbin" | awk 'END {print $4}')
case "$available" in ''|*[!0-9]*) exit 1 ;; esac
test "$available" -ge $(((bytes * 2 + 1023) / 1024 + 1024)) || exit 1
stage=$(mktemp -d "$root/usr/sbin/.attraccess-installer.XXXXXX")
trap 'rm -rf "$stage"' EXIT
timeout -k 5 300 dd bs=1 count="$bytes" of="$stage/helper" 2>/dev/null
test "$(wc -c < "$stage/helper")" -eq "$bytes" || exit 1
# Check EOF with its own deadline; do not hide a timeout behind a pipeline's exit.
timeout -k 5 10 dd bs=1 count=1 of="$stage/extra" 2>/dev/null || exit 1
test "$(wc -c < "$stage/extra")" -eq 0 || exit 1
test "$(sha256sum -- "$stage/helper" | cut -d' ' -f1)" = "$digest" || exit 1
printf '%s' "$image" | base64 -d > "$stage/signature"
test "$(wc -c < "$stage/signature")" -eq 384 || exit 1
printf '%s\\n' "$token" > "$stage/message"
cat "$stage/helper" >> "$stage/message"
timeout -k 5 45 openssl dgst -sha256 -verify "$base/installer-public.pem" -signature "$stage/signature" "$stage/message" >/dev/null 2>&1 || exit 1
timeout -k 5 45 sh -n "$stage/helper" || exit 1
chmod 0700 "$stage/helper"
sync; mv "$stage/helper" "$target"; sync
printf 'OK\\n'
`;
}
