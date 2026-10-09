import type { WagoOperationalMessage } from '../protocol/index';

export type CachedState = {
  controllerId: number;
  hardwareId: string;
  channelId: string;
  category: WagoOperationalMessage['category'];
  value: unknown;
  timestamp: string;
  sequence: number;
  streamId: string;
  unit?: string;
  kind?: 'live' | 'cumulative';
  revision?: number | null;
  contentHash?: string | null;
  receivedAt: number;
  offline?: boolean;
  invalidated?: boolean;
};

export type NodeKind = 'event' | 'read' | 'wait';

export type OperationalStream = {
  active: string;
  latestSourceTime: number;
  sampleNotBefore: number;
  stateTimestamp?: number;
  exhausted?: boolean;
  retired: Set<string>;
  sequences: Map<WagoOperationalMessage['category'], number>;
};

export type Waiter = (state?: CachedState, cancel?: boolean) => void;

export const MAX_CACHE_ENTRIES = 2_000;

export const MAX_PENDING_DISPATCHES = 100;

export const MAX_RETIRED_STREAMS = 128;

export const MAX_TIMEOUT_MS = 2_147_483_647;

export const PLUGIN_CONTEXT = Symbol.for('attraccess.plugin.context');

export const STREAM_A = '11111111-1111-4111-8111-111111111111';

export const STREAM_B = '22222222-2222-4222-8222-222222222222';

export const STALE_AFTER_MS = 90_000;

export class FlowSubscriptionError extends Error {
  constructor(readonly mqttError: unknown) {
    super(String(mqttError));
  }
}
