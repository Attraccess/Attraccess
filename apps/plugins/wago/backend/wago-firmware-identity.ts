/** Pinned FW31 capture: os-release identifies PTXdist, REVISIONS identifies firmware.
 * The owner's source file confirms /sys/firmware/devicetree/base/model (15 bytes).
 * Identity alone does not qualify firmware-specific operations.
 */
const sources = ['etc/os-release', 'etc/REVISIONS', 'sys/firmware/devicetree/base/model'];
const metadata: Record<string, string> = {
  PTXDIST_PLATFORM_NAME: 'cc100',
  VERSION: '2024.12.0',
  VERSION_ID: '2024.12.0',
  PTXDIST_VERSION: '2024.12.0',
  PTXDIST_BSP_VENDOR: 'WAGO',
  PTXDIST_BSP_NAME: 'CTL',
};

/** Fixed, bounded, source-framed decimal bytes preserve NUL and read failures.
 * Source contents are never shell code or framing delimiters.
 */
export function wagoFw31IdentityRead(withRoot = false): string {
  return `{ ${sources
    .map((path, i) => `printf 'source${i}\\n' && LC_ALL=C od -An -v -tu1 -N 8193 "${withRoot ? '$root' : ''}/${path}"`)
    .join(' && ')} && printf 'complete\\n'; }`;
}

export function isCc100Fw31Identity(output: string): boolean {
  // Decimal framing stays below the commissioning transport's 64 KiB cap.
  if (output.length + (output.endsWith('\n') ? 0 : 1) > 50000) return false;
  const chunks: number[][] = [[], [], []];
  let source = -1;
  let bytes = 0;
  let complete = false;
  for (const line of (output.endsWith('\n') ? output.slice(0, -1) : output).split('\n')) {
    if (complete) return false;
    if (line === `source${source + 1}` && source < 2) {
      source++;
      continue;
    }
    if (line === 'complete' && source === 2) {
      complete = true;
      continue;
    }
    if (source >= 0 && /^ *$/.test(line)) continue;
    if (source < 0 || !/^ *[0-9]+(?: +[0-9]+)* *$/.test(line)) return false;
    for (const token of line.trim().split(/ +/)) {
      const byte = Number(token);
      if (++bytes > 8192 || byte > 255) return false;
      chunks[source].push(byte);
    }
  }
  if (!complete) return false;
  const texts = chunks.map((chunk) => Buffer.from(chunk).toString('latin1'));
  if (texts[2] !== 'CC100-751-9301\0') return false;
  for (let i = 0; i < 2; i++) {
    if (/[^\n\x20-\x7e]/.test(texts[i])) return false;
    const fields = new Map<string, string>();
    for (const line of texts[i].split('\n')) {
      if (line === '' || line.startsWith('#')) continue;
      const match = /^([A-Z][A-Z0-9_]*)=(?:"([^"\\]*)"|([^"\\\s]+))$/.exec(line);
      if (!match || fields.has(match[1])) return false;
      fields.set(match[1], match[2] ?? match[3]);
    }
    if (i === 0) {
      if (!['PTXDIST_PLATFORM_NAME', 'VERSION', 'VERSION_ID'].every((key) => fields.has(key))) return false;
      for (const [key, value] of fields) {
        if (key === 'FIRMWARE' || (metadata[key] !== undefined && metadata[key] !== value)) return false;
      }
    } else {
      if (fields.get('FIRMWARE') !== '04.09.01(31)') return false;
      if ([...fields.keys()].some((key) => metadata[key] !== undefined)) return false;
    }
  }
  return true;
}

const identityAwk = `
function record( at, key, value) {
  if (line == "" || substr(line, 1, 1) == "#") { line = ""; return }
  at = index(line, "="); key = substr(line, 1, at - 1); value = substr(line, at + 1)
  if (!at || key !~ /^[A-Z][A-Z0-9_]*$/ || seen[source, key]++) { invalid = 1; line = ""; return }
  if (value ~ /^"[^"\\\\]*"$/) value = substr(value, 2, length(value) - 2)
  else if (value == "" || value ~ /["\\\\[:space:]]/) invalid = 1
  if (source == 0) {
    if (key == "FIRMWARE") invalid = 1
    ${Object.entries(metadata)
      .map(([key, value]) => `if (key == "${key}" && value != "${value}") invalid = 1`)
      .join('\n    ')}
  } else {
    if (key == "FIRMWARE" && value == "04.09.01(31)") firmware = 1
    if (${Object.keys(metadata)
      .map((key) => `key == "${key}"`)
      .join(' || ')}) invalid = 1
  }
  line = ""
}
BEGIN { source = -1 }
{
  if ((encoded += length($0) + 1) > 50000) { invalid = 1; exit 1 }
  if (complete) { invalid = 1; exit 1 }
  if ($0 == "source" (source + 1) && source < 2) { if (source >= 0) record(); source++; next }
  if ($0 == "complete" && source == 2) { complete = 1; next }
  if (source >= 0 && $0 ~ /^ *$/) next
  if (source < 0 || $0 !~ /^ *[0-9]+( +[0-9]+)* *$/) { invalid = 1; exit 1 }
  for (i = 1; i <= NF; i++) {
    byte = $i + 0
    if (++bytes > 8192 || byte > 255) { invalid = 1; exit 1 }
    if (source == 2) {
      if (nul || (byte != 0 && (byte < 32 || byte > 126))) { invalid = 1; exit 1 }
      if (byte == 0) nul = 1; else model = model sprintf("%c", byte)
    } else {
      if (byte != 10 && (byte < 32 || byte > 126)) { invalid = 1; exit 1 }
      if (byte == 10) record(); else line = line sprintf("%c", byte)
    }
  }
}
END { exit !(complete && source == 2 && model == "CC100-751-9301" && nul && firmware && seen[0,"PTXDIST_PLATFORM_NAME"] && seen[0,"VERSION"] && seen[0,"VERSION_ID"] && !invalid) }
`;

/** Shared by hardware, supervisor, and preparation gates. */
export function wagoFw31IdentityCheck(withRoot = false): string {
  return `${wagoFw31IdentityRead(withRoot)} | LC_ALL=C awk '${identityAwk}'`;
}
