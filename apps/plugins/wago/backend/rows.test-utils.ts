import type { WagoStorage } from './storage';

type InsertOf<T extends keyof WagoStorage> = Parameters<WagoStorage[T]['insert']>[0];



const NOW = '2026-09-05T12:00:00.000Z';

/** A controller row with every required column filled; `overrides` win. */
export function controllerRow(overrides: Record<string, unknown> & { hardwareId: string }): InsertOf<'controllers'> {
  return {
    trustState: 'untrusted',
    pairingCodeHash: '',
    protocolVersion: '1.0.0',
    runtimeVersion: '0.1.0',
    capabilities: '[]',
    lastSeenAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as never;
}

/** A configuration revision row with every required column filled; `overrides` win. */
export function revisionRow(overrides: Record<string, unknown> & { controllerId: number; revision: number }): InsertOf<'configurationRevisions'> {
  return {
    snapshot: '{}',
    contentHash: 'a'.repeat(64),
    state: 'pending',
    publishedAt: NOW,
    ...overrides,
  } as never;
}

/** A commissioning session row with every required column filled; `overrides` win. */
export function sessionRow(overrides: Record<string, unknown> = {}): InsertOf<'commissioningSessions'> {
  return {
    hardwareId: 'cc100-fixture',
    mqttServerId: 1,
    targetHost: '10.0.0.5',
    hostKeyFingerprint: 'SHA256:fixture',
    firmwareBaseline: '31',
    state: 'awaiting_delivery',
    auditLog: '[]',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as never;
}

