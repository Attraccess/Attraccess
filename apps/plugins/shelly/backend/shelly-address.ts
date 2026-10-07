import { isIPv4 } from 'node:net';
import { BadRequestException } from '@nestjs/common';

/** Devices use literal IPv4 addresses: retain LAN/link-local devices without
 * permitting credentials, paths, DNS rebinding, loopback or cloud metadata. */
export function validateShellyAddress(address: string): string {
  if (typeof address !== 'string' || !isIPv4(address)) {
    throw new BadRequestException('ipAddress must be a literal IPv4 device address');
  }
  const [a] = address.split('.').map(Number);
  if (
    a === 0 ||
    a === 127 ||
    a >= 224 ||
    ['169.254.169.254', '169.254.170.2', '169.254.170.23', '168.63.129.16', '100.100.100.200'].includes(address)
  ) {
    throw new BadRequestException('Invalid Shelly device destination');
  }
  return address;
}

export function validateShellyUrl(value: string): void {
  const url = new URL(value);
  if (url.protocol !== 'http:' || url.username || url.password || url.hash || url.port) {
    throw new BadRequestException('Invalid Shelly device URL');
  }
  validateShellyAddress(url.hostname);
}
