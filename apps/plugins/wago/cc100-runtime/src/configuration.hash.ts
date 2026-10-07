import { createHash } from 'node:crypto';
import { sort } from './configuration.sort';

export function hash(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(sort(value)))
    .digest('hex');
}
