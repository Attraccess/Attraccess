import type { WagoOperationalMessage } from './protocol';

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
