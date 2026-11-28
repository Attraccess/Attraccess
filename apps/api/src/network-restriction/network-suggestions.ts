import { isIP } from 'net';
import { networkInterfaces } from 'os';
import { normalizeAddress } from '../cidr-matcher';

const ipv4ToBigInt = (address: string) => address.split('.').reduce((sum, part) => (sum << 8n) + BigInt(part), 0n);

function ipv6ToBigInt(address: string): bigint {
  // Expand "::" and an embedded IPv4 tail into eight 16-bit groups.
  let text = address.toLowerCase().split('%')[0];
  const tail = text.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (tail) {
    const v4 = ipv4ToBigInt(tail[1]);
    text = text.replace(tail[1], `${(v4 >> 16n).toString(16)}:${(v4 & 0xffffn).toString(16)}`);
  }
  const [head, rest] = text.split('::');
  const headGroups = head ? head.split(':') : [];
  const restGroups = rest === undefined ? [] : rest ? rest.split(':') : [];
  const missing = rest === undefined ? 0 : 8 - headGroups.length - restGroups.length;
  const groups = [...headGroups, ...Array<string>(missing).fill('0'), ...restGroups];
  return groups.reduce((sum, group) => (sum << 16n) + BigInt(`0x${group || '0'}`), 0n);
}

function bigIntToIpv6(value: bigint): string {
  const groups = Array.from({ length: 8 }, (_, i) => Number((value >> BigInt((7 - i) * 16)) & 0xffffn).toString(16));
  // Compress the longest run of zero groups.
  let best = { start: -1, length: 0 };
  for (let i = 0; i < 8; i++) {
    if (groups[i] !== '0') continue;
    let j = i;
    while (j < 8 && groups[j] === '0') j++;
    if (j - i > best.length) best = { start: i, length: j - i };
    i = j;
  }
  if (best.length < 2) return groups.join(':');
  return `${groups.slice(0, best.start).join(':')}::${groups.slice(best.start + best.length).join(':')}`;
}

/** The network containing `address` with the given prefix, as CIDR text (the host bits cleared). Null for a non-address. */
export function subnetOf(address: string, ipv4Prefix = 24, ipv6Prefix = 64): string | null {
  const normalized = normalizeAddress(address.trim());
  const family = isIP(normalized);
  if (family === 4) {
    const value = ipv4ToBigInt(normalized);
    const network = (value >> BigInt(32 - ipv4Prefix)) << BigInt(32 - ipv4Prefix);
    const text = [24n, 16n, 8n, 0n].map((shift) => ((network >> shift) & 0xffn).toString()).join('.');
    return `${text}/${ipv4Prefix}`;
  }
  if (family === 6) {
    const shift = BigInt(128 - ipv6Prefix);
    return `${bigIntToIpv6((ipv6ToBigInt(normalized) >> shift) << shift)}/${ipv6Prefix}`;
  }
  return null;
}

const isLinkLocal = (address: string) => /^(169\.254\.|fe[89ab][0-9a-f]:)/i.test(address);

/** The interfaces, or none where the platform refuses to list them (some sandboxes): the hint must not break settings. */
function readInterfaces(): ReturnType<typeof networkInterfaces> | null {
  try {
    return networkInterfaces();
  } catch {
    return null;
  }
}

/** The subnets of this server's own network interfaces (not loopback, not link-local), as a hint for administrators. */
export function serverInterfaceRanges(
  interfaces: ReturnType<typeof networkInterfaces> | null = readInterfaces(),
): string[] {
  const ranges = new Set<string>();
  for (const entries of Object.values(interfaces ?? {})) {
    for (const entry of entries ?? []) {
      if (entry.internal || !entry.cidr || isLinkLocal(entry.address)) continue;
      const prefix = Number(entry.cidr.split('/')[1]);
      const subnet = subnetOf(entry.address, prefix, prefix);
      if (subnet) ranges.add(subnet);
    }
  }
  return [...ranges];
}
