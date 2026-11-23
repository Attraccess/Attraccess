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

/**
 * The form of `entry` that two spellings of the same range share: lower case, a bare address with its full prefix, an
 * IPv4 range with the host bits cleared (`10.0.0.1/8` is `10.0.0.0/8`) and an IPv6 address in its compressed form.
 * Used to spot duplicates only; the list keeps what the admin typed.
 */
export function canonicalRange(entry: string): string {
  const [address, prefix] = entry.trim().toLowerCase().split('/');
  if (IPV4.test(address)) {
    const length = prefix === undefined ? 32 : Number(prefix);
    const value = address.split('.').reduce((sum, part) => sum * 256 + Number(part), 0);
    const block = 2 ** (32 - length);
    const network = Math.floor(value / block) * block;
    const text = [3, 2, 1, 0].map((index) => Math.floor(network / 256 ** index) % 256).join('.');
    return `${text}/${length}`;
  }
  if (!isIpv6(address)) return entry.trim().toLowerCase();
  const compressed = new URL(`http://[${address}]/`).hostname.slice(1, -1);
  return `${compressed}/${prefix ?? 128}`;
}

/** Whether `entry` is the same range as one in `existing`, however it is spelled. */
export const containsRange = (existing: readonly string[], entry: string) => {
  const key = canonicalRange(entry);
  return existing.some((candidate) => canonicalRange(candidate) === key);
};
