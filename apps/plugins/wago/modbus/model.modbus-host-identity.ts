import ipaddr from 'ipaddr.js';

/** Pure numeric normalization, shared by validation and runtime bus ownership. No DNS lookup. */
export function modbusHostIdentity(host: string): string {
  if (ipaddr.isValid(host)) {
    const address = ipaddr.parse(host);
    if (address.kind() === 'ipv6') {
      const ipv6 = address as ipaddr.IPv6;
      if (ipv6.isIPv4MappedAddress() && !ipv6.zoneId) return ipv6.toIPv4Address().toString();
    }
    return address.toNormalizedString();
  }
  return host.toLowerCase();
}
