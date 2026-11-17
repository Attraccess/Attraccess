import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoManagedRuntimeService } from './service';
import { createWagoTestStorage, type WagoTestStorage } from '../../storage/testing';
import type { WagoCommissioningSessionRow, WagoControllerRow } from '../../storage';
import { WagoService } from '../../controllers/service';
import { WagoRuntimeArtifactsService } from '../artifacts/service';
import { WagoCommissioningReadiness } from '../../commissioning/readiness/readiness';
import { managedSsh } from './transport/ssh';
import type { BuildRuntimeArtifact } from '../artifacts/build';

export type ManagedRuntimeFixture = {
  store: WagoTestStorage;
  service: WagoManagedRuntimeService;
  encrypt: jest.Mock;
  decrypt: jest.Mock;
  audit: jest.Mock;
  rootProbe: jest.Mock;
  context: PluginContext;
  artifact: BuildRuntimeArtifact;
  principal: { userId: number; authenticationMethod: 'session' };
  session: (id?: number) => WagoCommissioningSessionRow;
};
export async function resetTestFixture(scope: ManagedRuntimeFixture) {
  scope.store = createWagoTestStorage();
  const key = randomBytes(32);
  scope.encrypt = jest.fn((plaintext: string) => {
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', key, iv);
    return Buffer.concat([iv, cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]).toString('base64');
  });
  scope.decrypt = jest.fn((envelope: string) => {
    const bytes = Buffer.from(envelope, 'base64'),
      cipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
    cipher.setAuthTag(bytes.subarray(-16));
    return Buffer.concat([cipher.update(bytes.subarray(12, -16)), cipher.final()]).toString();
  });
  scope.audit = jest.fn(async () => ({ status: 'recorded' }));
  scope.context = {
    storage: scope.store.storage,
    persistence: scope.store.persistence,
    secrets: { encrypt: scope.encrypt, decrypt: scope.decrypt },
    audit: { record: scope.audit },
    logger: { warn: jest.fn() },
  } as unknown as PluginContext;
  scope.service = new WagoManagedRuntimeService(
    scope.context,
    {
      registerRuntimeStatusHandler: jest.fn(),
      getSettings: async () => ({ operationalPrefix: 'attraccess/wago' }),
    } as unknown as WagoService,
    { current: async () => scope.artifact } as WagoRuntimeArtifactsService,
    {} as unknown as WagoCommissioningReadiness,
  );
  scope.service.onApplicationBootstrap();
  scope.rootProbe = jest.fn(async () => true);
  scope.service.registerRootProbe(scope.rootProbe);
  jest
    .mocked(managedSsh)
    .mockImplementation(async (_access, _key, header) =>
      header.startsWith('proof ') ? `OK ${header.split(' ')[1]}\n` : 'OK\n',
    );
}

/** Row a test expects to exist. */
export function required<T>(row: T | null | undefined): T {
  if (!row) throw new Error('Expected the row to exist');
  return row;
}

/** A claimed controller bound to MQTT server 7, as the managed-runtime tests expect it. */
export async function seedClaimedController(
  store: WagoTestStorage,
  overrides: Partial<Pick<WagoControllerRow, 'protocolVersion' | 'runtimeVersion'>> = {},
) {
  const now = new Date().toISOString();
  return store.tables.controllers.insert({
    id: 1,
    hardwareId: 'cc100-1',
    trustState: 'claimed',
    mqttServerId: 7,
    pairingCodeHash: 'fixture',
    protocolVersion: '1',
    runtimeVersion: '1',
    capabilities: '[]',
    lastSeenAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

/** Stored (encrypted) managed credential envelope of a session. */
export async function storedEnvelope(store: WagoTestStorage, sessionId = 1): Promise<string> {
  return required(await store.tables.managedAccess.get(sessionId)).encryptedCredentials;
}

/** Inserts the awaiting-verification commissioning session the enrolment tests start from. */
export async function seedAwaitingVerificationSession(
  scope: Pick<ManagedRuntimeFixture, 'store' | 'session' | 'principal'>,
) {
  const now = new Date().toISOString();
  return scope.store.tables.commissioningSessions.insert({
    ...scope.session(),
    mqttServerId: 7,
    firmwareBaseline: '31',
    state: 'awaiting_verification',
    initiatingPrincipal: JSON.stringify(scope.principal),
    deliveryToken: 'a'.repeat(32),
    dockerProvisionToken: 'a'.repeat(32),
    auditLog: '[]',
    createdAt: now,
    updatedAt: now,
  });
}
