// Shared CIDR matching: the TRUST_PROXY policy and the network restriction both match addresses against subnets.
import { BlockList, isIP } from 'net';

/** An IPv4-mapped IPv6 address (`::ffff:a.b.c.d`) is the IPv4 address it wraps; anything else is returned as is. */
export function normalizeAddress(address: string): string {
  return address.toLowerCase().startsWith('::ffff:') && isIP(address.slice(7)) === 4 ? address.slice(7) : address;
}

export type ParsedSubnet = { address: string; prefix?: number; type: 'ipv4' | 'ipv6' };

/** Parses `address` or `address/prefix` (IPv4 or IPv6); null when it is neither. A prefix must fit the family. */
export function parseSubnet(entry: string): ParsedSubnet | null {
  const parts = entry.trim().split('/');
  if (parts.length > 2) return null;
  // A prefix keeps the family it was written in; a lone IPv4-mapped address is the IPv4 address it wraps.
  const address = parts.length === 1 ? normalizeAddress(parts[0]) : parts[0];
  const family = isIP(address);
  if (family === 0) return null;
  const type = family === 4 ? 'ipv4' : 'ipv6';
  if (parts.length === 1) return { address, type };
  if (!/^\d+$/.test(parts[1])) return null;
  const prefix = Number(parts[1]);
  if (prefix > (family === 4 ? 32 : 128)) return null;
  return { address, prefix, type };
}

/** Matches addresses against the given subnets or single addresses; entries that do not parse are ignored. */
export function createCidrMatcher(entries: Iterable<string>): (address: string) => boolean {
  const list = new BlockList();
  for (const entry of entries) {
    const subnet = parseSubnet(entry);
    if (!subnet) continue;
    if (subnet.prefix === undefined) list.addAddress(subnet.address, subnet.type);
    else list.addSubnet(subnet.address, subnet.prefix, subnet.type);
  }
  return (address) => {
    const normalized = normalizeAddress(address.trim());
    const family = isIP(normalized);
    return family !== 0 && list.check(normalized, family === 4 ? 'ipv4' : 'ipv6');
  };
}
