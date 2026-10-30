// Resolves the client address of a request using the same TRUST_PROXY policy as the HTTP server
import { BlockList, isIP } from 'net';
import { IncomingMessage } from 'http';
import { isValidTrustProxyValue, resolveTrustProxySetting, TrustProxySetting } from '../trust-proxy';

const PRESETS: Record<string, string[]> = {
  loopback: ['127.0.0.1/8', '::1/128'],
  linklocal: ['169.254.0.0/16', 'fe80::/10'],
  uniquelocal: ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', 'fc00::/7'],
};

type TrustFn = (address: string, hop: number) => boolean;

const trustNothing: TrustFn = () => false;

function normalize(address: string): string {
  return address.startsWith('::ffff:') && isIP(address.slice(7)) === 4 ? address.slice(7) : address;
}

export function compileTrust(setting: TrustProxySetting): TrustFn {
  if (setting === true) return () => true;
  if (setting === false) return trustNothing;
  if (typeof setting === 'number') return (_address, hop) => hop < setting;

  const list = new BlockList();
  for (const token of setting.split(',')) {
    const entry = token.trim();
    // Preset names are case-sensitive in Express (proxy-addr); match it exactly.
    const subnets = Object.hasOwn(PRESETS, entry) ? PRESETS[entry] : [entry];
    for (const subnet of subnets) {
      const [address, prefix] = subnet.split('/');
      const family = isIP(address);
      if (family === 0) continue;
      const type = family === 4 ? 'ipv4' : 'ipv6';
      if (prefix === undefined) list.addAddress(address, type);
      else list.addSubnet(address, Number(prefix), type);
    }
  }
  return (address) => {
    const normalized = normalize(address);
    const family = isIP(normalized);
    return family !== 0 && list.check(normalized, family === 4 ? 'ipv4' : 'ipv6');
  };
}

let compiled: { raw: string | null | undefined; trust: TrustFn } | undefined;

/** Same rule as the HTTP server (main.bootstrap): an invalid TRUST_PROXY trusts no proxy. Compiled once per value. */
function trustFor(raw: string | null | undefined): TrustFn {
  if (compiled?.raw === raw) return compiled.trust;
  let trust = trustNothing;
  if (isValidTrustProxyValue(raw)) {
    try {
      trust = compileTrust(resolveTrustProxySetting(raw));
    } catch {
      trust = trustNothing;
    }
  }
  compiled = { raw, trust };
  return trust;
}

/**
 * Walks X-Forwarded-For from the right while the hop is a trusted proxy, like Express' `req.ip`.
 * Without TRUST_PROXY the socket address is used and the header is ignored. Never throws: anything
 * unexpected falls back to the socket address.
 */
export function resolveClientAddress(request: IncomingMessage | undefined, trustProxyRaw?: string | null): string {
  const peer = normalize(request?.socket?.remoteAddress ?? 'unknown');
  try {
    const trust = trustFor(trustProxyRaw);
    const header = request?.headers?.['x-forwarded-for'];
    const forwarded = (Array.isArray(header) ? header.join(',') : (header ?? ''))
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);

    let address = peer;
    let hop = 0;
    while (trust(address, hop) && forwarded.length > 0) {
      address = normalize(forwarded.pop() as string);
      hop += 1;
    }
    return address;
  } catch {
    return peer;
  }
}

/** Expands an IPv6 address (without zone id) to its eight 16-bit groups, or null when it is not one. */
function ipv6Groups(address: string): number[] | null {
  let text = address;
  // An embedded IPv4 tail (e.g. 64:ff9b::1.2.3.4) is the last two groups.
  const lastColon = text.lastIndexOf(':');
  const dotted = text.slice(lastColon + 1);
  if (isIP(dotted) === 4) {
    const [a, b, c, d] = dotted.split('.').map(Number);
    text = `${text.slice(0, lastColon + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const parse = (part: string) => (part ? part.split(':').map((group) => parseInt(group, 16)) : []);
  const compressed = text.indexOf('::');
  if (compressed === -1) {
    const groups = parse(text);
    return groups.length === 8 ? groups : null;
  }
  const left = parse(text.slice(0, compressed));
  const right = parse(text.slice(compressed + 2));
  const missing = 8 - left.length - right.length;
  return missing < 1 ? null : [...left, ...new Array<number>(missing).fill(0), ...right];
}

/**
 * Key for per-address limits. One IPv6 subscriber usually owns a whole /64, so IPv6 addresses are bucketed by
 * their /64 prefix; IPv4 (also IPv4-mapped IPv6) and anything that is not an address are used as is.
 */
export function addressBucket(address: string): string {
  const normalized = normalize(address.split('%')[0].toLowerCase());
  if (isIP(normalized) !== 6) return isIP(normalized) === 4 ? normalized : address;
  const groups = ipv6Groups(normalized);
  if (!groups) return address;
  return `${groups
    .slice(0, 4)
    .map((group) => group.toString(16))
    .join(':')}::/64`;
}
