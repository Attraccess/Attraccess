import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import type { WagoController } from './controllers/entity';
import type { WagoEnrollment } from './controllers/enrollment.entity';
import { WagoService } from './controllers/service';
import { hostDataWithFlows } from './persistence.test-utils';
import { createWagoTestStorage } from './storage/testing';

export const controller = (): WagoController => ({
  id: 1,
  hardwareId: 'cc100-01',
  trustState: 'untrusted',
  name: null,
  mqttServerId: 2,
  credentialMqttServerId: null,
  credentialEpoch: null,
  enrollmentId: 3,
  pairingCodeHash: 'pairing-hash',
  fingerprint: '',
  protocolVersion: '1.0.0',
  runtimeVersion: '1.0.0',
  capabilities: '["claim","heartbeat","configuration-v1"]',
  lastSequence: 4,
  lastHeartbeatAt: null,
  lastSeenAt: '2026-01-01T00:00:00.000Z',
  compatibilityError: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

/**
 * A WagoService over the in-memory record port. The rows are seeded through the port; tests assert the stored state
 * with `tables` (the port) or `test.rows(name)`.
 */
export async function createWagoServiceFixture(
  services: WagoService[],
  controllers: WagoController[] = [controller()],
  enrollments: WagoEnrollment[] = [],
  defaultMqttServerId: number | null = null,
) {
  const test = createWagoTestStorage();
  const tables = test.tables;
  await tables.settings.insert({ id: 1, defaultMqttServerId, operationalPrefix: 'attraccess/wago' });
  for (const row of controllers) await tables.controllers.insert(row);
  for (const row of enrollments) await tables.enrollments.insert(row);
  const subscriptions: Array<{ unsubscribe: jest.Mock }> = [];
  const findNodes = jest.fn().mockResolvedValue([]);
  const open = jest.fn(() => tables);
  const context = {
    hostData: hostDataWithFlows(findNodes),
    // Production services open the port from the context; the same typed tables serve every call.
    storage: { open },
    persistence: test.persistence,
    logger: { warn: jest.fn() },
    mqtt: {
      subscribe: jest.fn().mockImplementation(async () => {
        const subscription = { unsubscribe: jest.fn() };
        subscriptions.push(subscription);
        return subscription;
      }),
      publish: jest.fn(),
    },
    getMqttCredentialProvisioning: jest.fn(),
  } as unknown as PluginContext;
  const service = new WagoService(context);
  services.push(service);
  // Unit tests invoke service methods directly, outside Nest's module lifecycle.
  Object.assign(service, {
    storage: tables,
    controllers: tables.controllers,
    settings: tables.settings,
    enrollments: tables.enrollments,
    drafts: tables.configurationDrafts,
    revisions: tables.configurationRevisions,
  });
  return { service, test, tables, context, subscriptions, open };
}
