import { createHash } from 'node:crypto';
import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
export const digestPattern = /^[a-f0-9]{64}$/;

export const hostId = createHash('sha256').update(hostname()).digest('hex');

export const processId = randomUUID();
export const uuidPattern = '[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}';

export const temporaryPattern = new RegExp(
  `^(upload|delivery|current)-v1-([a-f0-9]{64})-([1-9][0-9]*)-(${uuidPattern})-(${uuidPattern})$`,
);
