// Subnet-scan targets for Shelly discovery (ATT-497).
//
// The scan is the fallback (and, in practice, the primary) discovery path:
// most Attraccess installs run in a Docker container on a bridge network, where
// mDNS multicast never reaches the LAN but plain outbound HTTP to LAN addresses
// does. So an operator on Docker points discovery at their LAN CIDR
// ("192.168.1.0/24") and the scan finds the devices mDNS could not announce.
//
// Two hard limits, both deliberate:
//  * Only RFC1918 / link-local ranges may be scanned. Without this the endpoint
//    is a general-purpose port scanner pointed at whatever the operator types.
//  * At most a /22 (1022 hosts). The scan runs inside the request, and a /16
//    would be 65k probes.
import { networkInterfaces } from 'node:os';

/** Smallest prefix length (i.e. largest subnet) we are willing to enumerate. */
export const MIN_PREFIX_LENGTH = 22;

/**
 * Thrown by expandCidr for input the operator can fix. Lets the controller map
 * these to 400 while genuine failures (probe, registry) still surface as 500.
 */
export class InvalidCidrError extends Error {}

const CIDR_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/;

function toInt(octets: number[]): number {
  // >>> 0 keeps the result unsigned — bitwise ops in JS are signed 32-bit.
  return ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
}

function toIp(value: number): string {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff].join('.');
}

/** True for RFC1918 (10/8, 172.16/12, 192.168/16) and link-local (169.254/16). */
export function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

/**
 * Expands an IPv4 CIDR into the list of host addresses to probe. Network and
 * broadcast addresses are omitted for /30 and larger; /31 and /32 are returned
 * as-is (they have no broadcast address by convention).
 *
 * Throws a message suitable for showing to the operator when the CIDR is
 * malformed, outside the private ranges, or larger than MIN_PREFIX_LENGTH.
 */
export function expandCidr(cidr: string): string[] {
  const match = CIDR_PATTERN.exec(cidr.trim());
  if (!match) {
    throw new InvalidCidrError(`"${cidr}" is not a valid IPv4 CIDR (expected e.g. 192.168.1.0/24)`);
  }

  const octets = match.slice(1, 5).map(Number);
  const prefix = Number(match[5]);
  if (octets.some((o) => o > 255) || prefix > 32) {
    throw new InvalidCidrError(`"${cidr}" is not a valid IPv4 CIDR (expected e.g. 192.168.1.0/24)`);
  }
  if (prefix < MIN_PREFIX_LENGTH) {
    throw new InvalidCidrError(
      `subnet ${cidr} is too large to scan — use a prefix of /${MIN_PREFIX_LENGTH} or longer (e.g. /24)`,
    );
  }

  const address = toInt(octets);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = (address & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;

  if (!isPrivateIpv4(toIp(network))) {
    throw new InvalidCidrError(
      `refusing to scan ${cidr}: only private networks (10/8, 172.16/12, 192.168/16, 169.254/16) may be scanned`,
    );
  }

  const first = prefix >= 31 ? network : network + 1;
  const last = prefix >= 31 ? broadcast : broadcast - 1;

  const hosts: string[] = [];
  for (let value = first; value <= last; value++) {
    hosts.push(toIp(value));
  }
  return hosts;
}

/**
 * CIDRs of the host's own private IPv4 networks, used when the operator does
 * not name one. Subnets larger than MIN_PREFIX_LENGTH are dropped — which is
 * exactly what happens to Docker's default /16 bridge network, so a containerised
 * install auto-scans nothing and the operator must pass their LAN CIDR.
 */
export function localScanTargets(): string[] {
  const targets = new Set<string>();
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      // Node <18.4 reports family as 'IPv4', newer as 4 — accept both.
      const isIpv4 = address.family === 'IPv4' || (address.family as unknown as number) === 4;
      if (!isIpv4 || address.internal || !address.cidr) continue;
      const prefix = Number(address.cidr.split('/')[1]);
      if (!Number.isInteger(prefix) || prefix < MIN_PREFIX_LENGTH) continue;
      if (!isPrivateIpv4(address.address)) continue;
      targets.add(address.cidr);
    }
  }
  return [...targets];
}
