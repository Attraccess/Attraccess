import { createRequire } from 'node:module';
import { join } from 'node:path';
import { type Snapshot } from '../src/runtime';

export const temporary = process.env.WAGO_INTEGRATION_TEMP!;

export const hardwareId = 'integration-cc100';

export const prefix = 'isolated/customer';

export const base = `${prefix}/v1/controllers/${hardwareId}`;

export const createBroker = createRequire(join(temporary, 'package.json'))('aedes');

export const snapshot: Snapshot = {
  version: 1,
  physicalPoints: [
    { id: 'relay', hardwareProfile: '751-9301', channel: 0 },
    { id: 'sensor', hardwareProfile: '879-3000', channel: 0 },
  ],
  logicalChannels: [
    {
      id: 'load',
      physicalPointId: 'relay',
      profile: 'generic-digital-output',
      capabilities: ['output'],
      disconnectPolicy: { mode: 'hold' },
    },
    {
      id: 'level',
      physicalPointId: 'sensor',
      profile: 'generic-measurement',
      capabilities: ['measurement'],
      disconnectPolicy: { mode: 'hold' },
      measurement: { unit: 'percent', scale: 1, offset: 0 },
    },
  ],
};

export function outputCommand(id: string) {
  return {
    id,
    channelId: 'load',
    action: 'set',
    value: true,
    expectedConfigurationRevision: 1,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
}

// Only persistence and host SDK boundaries are substituted. All wire decoding,
// commissioning, report reconciliation and simulator execution are production code.
export function repository(initial: Array<Record<string, any>> = []) {
  const rows = initial;
  const query = {
    where: () => query,
    andWhere: () => query,
    innerJoin: () => query,
    getMany: async () => rows,
  };
  return {
    rows,
    create: (value: object) => ({ id: rows.length + 1, ...value }),
    save: async (value: Record<string, any>) => {
      if (!rows.includes(value)) rows.push(value);
      return value;
    },
    find: async () => rows,
    findOneBy: async (where: object) =>
      rows.find((row) => Object.entries(where).every(([key, value]) => row[key] === value)) ?? null,
    createQueryBuilder: () => query,
  };
}

export async function eventually(assertion: () => void | Promise<void>, label: string, timeout = 6000): Promise<void> {
  const deadline = Date.now() + timeout;
  let last: unknown;
  while (Date.now() < deadline) {
    try {
      await assertion();
      return;
    } catch (error) {
      last = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`${label}: ${String(last)}`);
}

export function dirnameOf(path: string): string {
  return path.slice(0, path.lastIndexOf('/'));
}
