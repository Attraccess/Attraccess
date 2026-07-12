import { createHash, timingSafeEqual } from 'crypto';

export function hashPin(pin: string): string {
  return createHash('sha256').update(pin).digest('hex');
}

export function verifyPinHash(pin: string, storedHash: string | null): boolean {
  if (!storedHash) return false;
  const candidate = Buffer.from(hashPin(pin));
  const stored = Buffer.from(storedHash);
  // ponytail: timingSafeEqual requires equal-length buffers; both are sha256 hex so always 64 chars
  return timingSafeEqual(candidate, stored);
}
