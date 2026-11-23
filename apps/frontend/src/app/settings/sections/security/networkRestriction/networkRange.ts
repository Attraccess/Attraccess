const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const MAPPED_IPV4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i;

/** The browser's compressed form of an IPv6 address (`[::ffff:a00:1]` style, no IPv4 tail), or null. */
function compressIpv6(address: string): string | null {
  if (!/^[0-9a-fA-F:.]+$/.test(address) || !address.includes(':')) return null;
  try {
    return new URL(`http://[${address}]/`).hostname.slice(1, -1);
  } catch {
    return null;
  }
}

// BigInt() instead of literals: the app targets below ES2020.
const ZERO = BigInt(0);
const OCTET = BigInt(8);
const GROUP = BigInt(16);

const ipv4Value = (address: string) => address.split('.').reduce((sum, part) => (sum << OCTET) + BigInt(part), ZERO);

function ipv6Value(compressed: string): bigint {
  const [head, tail] = compressed.split('::');
  const left = head ? head.split(':') : [];
  const right = tail === undefined ? [] : tail ? tail.split(':') : [];
  const groups = [...left, ...Array<string>(8 - left.length - right.length).fill('0'), ...right];
  return groups.reduce((sum, group) => (sum << GROUP) + BigInt(parseInt(group, 16)), ZERO);
}

interface ParsedRange {
  version: 4 | 6;
  /** The network address with the host bits cleared. */
  network: bigint;
  prefix: number;
}

/** An entry as numbers: a bare address has its full prefix, and a bare IPv4-mapped IPv6 address counts as IPv4. */
function parseRange(entry: string): ParsedRange | null {
  const [rawAddress, rawPrefix, ...rest] = entry.trim().split('/');
  if (rest.length > 0 || (rawPrefix !== undefined && !/^\d{1,3}$/.test(rawPrefix))) return null;
  const prefix = rawPrefix === undefined ? undefined : Number(rawPrefix);
  // Like the server: only a bare mapped address becomes IPv4; a mapped range stays IPv6.
  const mapped = prefix === undefined ? MAPPED_IPV4.exec(rawAddress) : null;
  const address = mapped && IPV4.test(mapped[1]) ? mapped[1] : rawAddress;
  let version: 4 | 6;
  let value: bigint;
  if (IPV4.test(address)) {
    version = 4;
    value = ipv4Value(address);
  } else {
    const compressed = compressIpv6(address);
    if (compressed === null) return null;
    version = 6;
    value = ipv6Value(compressed);
  }
  const bits = version === 4 ? 32 : 128;
  const length = prefix ?? bits;
  if (length > bits) return null;
  const shift = BigInt(bits - length);
  return { version, network: (value >> shift) << shift, prefix: length };
}

/** Splits pasted text into entries; commas, semicolons and whitespace all separate. */
export const splitRangeInput = (text: string) => text.split(/[\s,;]+/).filter(Boolean);

/** Whether `entry` is an IPv4 or IPv6 address, or such an address with a prefix. The server stays the judge. */
export const isValidRange = (entry: string): boolean => entry === entry.trim() && parseRange(entry) !== null;

/**
 * The form of `entry` that two spellings of the same range share: a bare address with its full prefix, the host bits
 * cleared (`10.0.0.1/8` is `10.0.0.0/8`, `fd00::1/8` is `fd00::/8`) and a bare IPv4-mapped address as IPv4, as the server
 * matches it. Used to spot duplicates only; the list keeps what the admin typed.
 */
export function canonicalRange(entry: string): string {
  const parsed = parseRange(entry);
  if (parsed === null) return entry.trim().toLowerCase();
  return `${parsed.version}:${parsed.network.toString(16)}/${parsed.prefix}`;
}

/** Whether `a` and `b` are the same range, however they are spelled. */
export const isSameRange = (a: string, b: string) => canonicalRange(a) === canonicalRange(b);

/** Whether `entry` is the same range as one in `existing`, however it is spelled. */
export const containsRange = (existing: readonly string[], entry: string) =>
  existing.some((candidate) => isSameRange(candidate, entry));

/** Whether some range in `existing` already holds every address of `entry`, e.g. `10.0.0.0/8` holds `10.1.2.0/24`. */
export function isCoveredBy(existing: readonly string[], entry: string): boolean {
  const inner = parseRange(entry);
  if (inner === null) return containsRange(existing, entry);
  return existing.some((candidate) => {
    const outer = parseRange(candidate);
    if (outer === null || outer.version !== inner.version || outer.prefix > inner.prefix) return false;
    const shift = BigInt((inner.version === 4 ? 32 : 128) - outer.prefix);
    return (inner.network >> shift) << shift === outer.network;
  });
}
