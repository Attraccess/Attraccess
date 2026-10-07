import { randomUUID } from 'node:crypto';
import 'reflect-metadata';
export const temporary = process.env.WAGO_FLEET_TEMP ?? '';
export const prefix = `fixture/${randomUUID()}`;
export const hardwareId = 'production-fleet-fixture';
export const base = `${prefix}/v1/controllers/${hardwareId}`;
export type Wire = {
  topic: string;
  payload: Buffer;
  body: {
    id: string;
    expiresAt: string;
    channelId: string;
    streamId: string;
    sequence: number;
    status: string;
    inputs?: Record<string, boolean>;
  };
};
export type Log = { nodeId: string; type: string; payload?: () => { output: { wago: object } }; flowRunId: string };
export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
export function required<T>(value: T | null | undefined): T {
  if (value === undefined || value === null) throw new Error('Expected fixture evidence is missing');
  return value;
}
export async function eventually(assertion: () => void | Promise<void>, timeout = 6000): Promise<void> {
  const deadline = Date.now() + timeout;
  let last: unknown;
  do {
    try {
      await assertion();
      return;
    } catch (error) {
      last = error;
    }
    await delay(20);
  } while (Date.now() < deadline);
  throw last;
}
