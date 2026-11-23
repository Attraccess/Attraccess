const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

function isIpv6(address: string): boolean {
  if (!/^[0-9a-fA-F:.]+$/.test(address) || !address.includes(':')) return false;
  try {
    return new URL(`http://[${address}]/`).hostname !== '';
  } catch {
    return false;
  }
}

/** Splits pasted text into entries; commas, semicolons and whitespace all separate. */
export const splitRangeInput = (text: string) => text.split(/[\s,;]+/).filter(Boolean);

/** Whether `entry` is an IPv4 or IPv6 address, or such an address with a prefix. The server stays the judge. */
export function isValidRange(entry: string): boolean {
  const [address, prefix, ...rest] = entry.split('/');
  if (rest.length > 0) return false;
  const v4 = IPV4.test(address);
  if (!v4 && !isIpv6(address)) return false;
  if (prefix === undefined) return true;
  return /^\d{1,3}$/.test(prefix) && Number(prefix) <= (v4 ? 32 : 128);
}
