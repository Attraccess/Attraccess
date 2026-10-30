// Resolves the client address of a request using the same TRUST_PROXY policy as the HTTP server
import { BlockList, isIP } from 'net';
import { IncomingMessage } from 'http';
import { resolveTrustProxySetting, TrustProxySetting } from '../trust-proxy';

const PRESETS: Record<string, string[]> = {
  loopback: ['127.0.0.1/8', '::1/128'],
  linklocal: ['169.254.0.0/16', 'fe80::/10'],
  uniquelocal: ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', 'fc00::/7'],
};

type TrustFn = (address: string, hop: number) => boolean;

function normalize(address: string): string {
  return address.startsWith('::ffff:') && isIP(address.slice(7)) === 4 ? address.slice(7) : address;
}

export function compileTrust(setting: TrustProxySetting): TrustFn {
  if (setting === true) return () => true;
  if (setting === false) return () => false;
  if (typeof setting === 'number') return (_address, hop) => hop < setting;

  const list = new BlockList();
  for (const token of setting.split(',')) {
    const entry = token.trim();
    const subnets = PRESETS[entry.toLowerCase()] ?? [entry];
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

/**
 * Walks X-Forwarded-For from the right while the hop is a trusted proxy, like Express' `req.ip`.
 * Without TRUST_PROXY the socket address is used and the header is ignored.
 */
export function resolveClientAddress(request: IncomingMessage | undefined, trustProxyRaw?: string | null): string {
  const peer = normalize(request?.socket?.remoteAddress ?? 'unknown');
  const trust = compileTrust(resolveTrustProxySetting(trustProxyRaw));
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
}
