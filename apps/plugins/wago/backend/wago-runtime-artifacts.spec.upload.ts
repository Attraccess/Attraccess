import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { bundle } from './wago-runtime-artifacts.spec.bundle';

export function upload(data = bundle(), checksum = createHash('sha256').update(data).digest('hex')) {
  return { bundle: Readable.from([data]), checksum: Readable.from([checksum]) };
}
