import type { ModbusConfiguration, ModbusPoint } from '../../modbus/model';
export type DisconnectPolicy = { mode: 'hold' | 'immediate' | 'watchdog'; timeoutMs?: number };

export type Snapshot = {
  version: number;
  modbus?: ModbusConfiguration;
  physicalPoints: Array<{
    id: string;
    hardwareProfile: '751-9301' | '879-3000' | '879-1300' | 'modbus';
    channel: number;
    modbus?: ModbusPoint;
  }>;
  logicalChannels: Array<{
    id: string;
    physicalPointId: string;
    profile: string;
    capabilities: string[];
    invert?: boolean;
    disconnectPolicy: DisconnectPolicy;
    range?: { minimum: number; maximum: number };
    pulse?: { durationMs: number };
    guard?: { channelId: string; when: 'on' | 'off' };
    feedback?: { channelId: string; expected: 'match' | 'inverse'; timeoutMs: number };
    measurement?: { unit: string; scale: number; offset: number; kind?: 'live' | 'cumulative' };
  }>;
};

export type ValidationError = { path: string; code: string; message: string };

export type PulseRoute = {
  channel: Snapshot['logicalChannels'][number];
  point: Snapshot['physicalPoints'][number];
  snapshot: Snapshot;
};

export type RuntimeState = {
  credentials?: { username: string; password: string; prefix?: string; credentialEpoch?: string };
  credentialRotation?: { revision: number; token: string };
  accepted?: { revision: number; contentHash: string; snapshot: Snapshot };
  outputs: Record<string, boolean>;
  manualOutputChannelIds?: string[];
  uncertainOutputChannelIds?: string[];
  /** Legacy shutdown obligations, migrated to captured routes on startup. */
  pendingPulseChannelIds?: string[];
  pendingPulseRoutes?: PulseRoute[];
  commandIds: string[];
  commandExpiries?: Record<string, string>;
  /** Highest reserved operational sequence; skipped unused values are intentional. */
  sequence?: number;
};

export interface Transport {
  publish(topic: string, payload: unknown, options?: { retain?: boolean }): Promise<void>;
  subscribe(topic: string, listener: (payload: Buffer) => void | Promise<void>): Promise<void>;
}

/** Optional absolute expiry also travels to a subprocess's final pre-send check. */
export type WriteAdmission = (() => void) & { expiresAt?: number };
export type MeasurementReading = { pointId: string } & (
  { ok: true; raw: boolean | number; timestamp: string } | { ok: false; error: unknown }
);

export interface DeviceAdapter {
  configure?(snapshot: Snapshot): void;
  /** Prepare may throw; the returned synchronous installation must not throw. */
  prepareConfiguration?(snapshot: Snapshot): () => void;
  /** Retain the original route for pulse completion across configuration changes. */
  captureWrite?(point: Snapshot['physicalPoints'][number], snapshot: Snapshot): (value: boolean) => Promise<void>;
  suspend?(): () => void;
  measurementSource?(point: Snapshot['physicalPoints'][number]): string;
  shouldPoll?(point: Snapshot['physicalPoints'][number], now: number): boolean;
  /** Sweep-local bulk reads; timestamps belong to the actual hardware acquisition. */
  readMeasurements?(points: Snapshot['physicalPoints']): AsyncGenerator<MeasurementReading>;
  /** True when a failed write may already have reached the physical device. */
  writeMayHaveBeenTransmitted?(error: unknown): boolean;

  validate?(snapshot: Snapshot): ValidationError[];
  checkAvailability?(): Promise<void>;
  write(point: Snapshot['physicalPoints'][number], value: boolean, admit?: WriteAdmission): Promise<void>;
  read(point: Snapshot['physicalPoints'][number]): Promise<boolean | number>;
  readOutput?(point: Snapshot['physicalPoints'][number]): Promise<boolean>;
}

export interface StateStore {
  load(): Promise<RuntimeState>;
  save(state: RuntimeState): Promise<void>;
}

/** A write was refused before physical transmission. */
export class WriteAdmissionError extends Error {
  constructor(readonly code: 'expired' | 'outage_ended' | 'runtime_update') {
    super(
      code === 'runtime_update'
        ? 'Runtime update required; outputs are held in failsafe'
        : code === 'expired'
          ? 'command has expired'
          : 'disconnect outage has ended',
    );
  }
}
