import { lookup } from 'node:dns/promises';

interface BrokerEndpoint {
  host: string;
}

/**
 * Whether two broker records reach the same credential store. Duplicate server records and DNS aliases share the
 * active credentials; a partial address overlap is ambiguous and throws, so the retirement stays retryable.
 */
export async function sharesCredentialDestination(previous: BrokerEndpoint, current: BrokerEndpoint): Promise<boolean> {
  const sameHost = previous.host.toLowerCase().replace(/\.$/, '') === current.host.toLowerCase().replace(/\.$/, '');
  if (sameHost) return true;
  const destinations = await Promise.all([lookup(previous.host, { all: true }), lookup(current.host, { all: true })]);
  const address = (value: string) => value.toLowerCase().replace(/^::ffff:/, '');
  if (!destinations[0].length || !destinations[1].length) throw new Error();
  const previousAddresses = new Set(destinations[0].map((item) => address(item.address)));
  const currentAddresses = new Set(destinations[1].map((item) => address(item.address)));
  const overlaps = [...previousAddresses].some((item) => currentAddresses.has(item));
  const sameAddresses =
    previousAddresses.size === currentAddresses.size &&
    [...previousAddresses].every((item) => currentAddresses.has(item));
  // A partial overlap may include another credential store. Neither revocation nor dropping the cleanup
  // obligation is safe in that case.
  if (overlaps && !sameAddresses) throw new Error();
  return sameAddresses;
}
