/** Release identity is distinct from the PTXdist BSP version. A UI baseline is not evidence.
 * Source boundary: https://github.com/WAGO/cc100-firmware-sdk/tags contains separate
 * firmware releases; the BSP alone does not identify a vendor firmware release.
 * This recognizes identity only, never qualification of firmware-specific operations.
 */
const releases = ['31', '4.9.1(31)', '04.09.01(31)'];
const bsp = '2024.12.0';

export function isCc100Fw31Identity(output: string): boolean {
  // The same byte contract is checked before shell parsing, including comments.
  if (Buffer.byteLength(output, 'utf8') > 16384 || /[^\n\x20-\x7e]/.test(output)) return false;
  const fields = new Map<string, string>();
  for (const line of output.split('\n')) {
    const key = line.split('=')[0];
    if (!['PTXDIST_PLATFORM_NAME', 'VERSION_ID', 'VERSION'].includes(key)) continue;
    if (fields.has(key)) return false;
    const value = line.slice(key.length + 1);
    fields.set(key, /^"[^"\r\n]*"$/.test(value) ? value.slice(1, -1) : value);
  }
  return (
    fields.get('PTXDIST_PLATFORM_NAME') === 'cc100' &&
    [fields.get('VERSION_ID'), fields.get('VERSION')].some((value) => releases.includes(value ?? '')) &&
    [...fields].every(
      ([key, value]) =>
        key === 'PTXDIST_PLATFORM_NAME' || releases.includes(value) || (key === 'VERSION_ID' && value === bsp),
    )
  );
}

/** Same allowlist as the host-side check, evaluated as data, never sourced as shell. */
const identityAwk = `
function release(value) { return ${releases.map((value) => `value == "${value}"`).join(' || ')} }
function record(line, at, key, value) {
  at = index(line, "="); key = at ? substr(line, 1, at - 1) : line; value = at ? substr(line, at + 1) : ""
  if (key != "PTXDIST_PLATFORM_NAME" && key != "VERSION_ID" && key != "VERSION") return
  if (seen[key]++) invalid = 1
  if (value ~ /^"[^"\\r]*"$/) value = substr(value, 2, length(value) - 2)
  if (key == "PTXDIST_PLATFORM_NAME") { if (value == "cc100") model = 1; else invalid = 1 }
  else if (release(value)) firmware = 1
  else if (key != "VERSION_ID" || value != "${bsp}") invalid = 1
}
$0 == "complete" { complete = 1; next }
{
  for (i = 1; i <= NF; i++) {
    byte = $i + 0
    if (++bytes > 16384 || $i !~ /^[0-9]+$/ || (byte != 10 && (byte < 32 || byte > 126))) { invalid = 1; exit 1 }
    if (byte == 10) { record(line); line = "" }
    else line = line sprintf("%c", byte)
  }
}
END { if (line != "") record(line); exit !(complete && model && firmware && !invalid) }
`;

/** Feed decimal bytes to POSIX awk: some awk implementations truncate NUL in
 * direct text input. The completion marker also propagates od read failures.
 * No arbitrary path or shell input is accepted by this generator.
 */
export function wagoFw31IdentityCheck(withRoot = false): string {
  return `{ LC_ALL=C od -An -v -tu1 "${withRoot ? '$root' : ''}/etc/os-release" && printf 'complete\\n'; } | LC_ALL=C awk '${identityAwk}'`;
}
