export type DisconnectPolicy = { mode: 'hold' | 'immediate' | 'watchdog'; timeoutMs?: number };

export type Snapshot = {
  version: number;
  physicalPoints: Array<{ id: string; hardwareProfile: '751-9301' | '879-3000' | '879-1300'; channel: number }>;
  logicalChannels: Array<{
    id: string;
    physicalPointId: string;
    profile: string;
    capabilities: string[];
    disconnectPolicy: DisconnectPolicy;
    pulse?: { durationMs: number };
    guard?: { channelId: string; when: 'on' | 'off' };
    measurement?: { unit: string; scale: number; offset: number };
  }>;
};

export type ValidationError = { path: string; code: string; message: string };

export type RuntimeState = {
  credentials?: { username: string; password: string };
  accepted?: { revision: number; contentHash: string; snapshot: Snapshot };
  outputs: Record<string, boolean>;
  commandIds: string[];
  commandExpiries?: Record<string, string>;
};

export interface Transport {
  publish(topic: string, payload: unknown, options?: { retain?: boolean }): Promise<void>;
  subscribe(topic: string, listener: (payload: Buffer) => void | Promise<void>): Promise<void>;
}

export interface DeviceAdapter {
  write(point: Snapshot['physicalPoints'][number], value: boolean): Promise<void>;
  read(point: Snapshot['physicalPoints'][number]): Promise<boolean | number>;
}

export interface StateStore {
  load(): Promise<RuntimeState>;
  save(state: RuntimeState): Promise<void>;
}
