import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { sessionRow } from '../rows.test-utils';
import { spyOnWagoStorage } from '../storage-spy.test-utils';
import { createWagoTestStorage } from '../storage/testing';
import type { WagoService } from '../controllers/service';
import { WagoCommissioningService } from './service';
import type { WagoCommissioningSession } from './sessions/session.entity';

export const verifier = 'v'.repeat(43);

/**
 * A commissioning service over in-memory storage holding one session (id 1). Tests read the stored row with
 * `stored()`: the service loads and writes rows through the record port, so the `session` it returns is only the row
 * as first inserted.
 */
export async function securityHarness(
  overrides: Partial<WagoCommissioningSession> = {},
  Service: typeof WagoCommissioningService = WagoCommissioningService,
) {
  const storage = createWagoTestStorage();
  const spy = spyOnWagoStorage(storage);
  const session = await storage.tables.commissioningSessions.insert(
    sessionRow({
      id: 1,
      hardwareId: 'cc100-test',
      mqttServerId: 2,
      enrollmentId: null,
      pairingCode: 'encrypted:v1:opaque-ciphertext',
      deliveryToken: 'a'.repeat(32),
      state: 'awaiting_delivery',
      controllerName: 'Test',
      auditLog: '[]',
      ...overrides,
    }),
  );
  const wago = {
    registerCommissioningDiscoveryHandler: jest.fn(),
    revokeEnrollmentById: jest.fn().mockResolvedValue(undefined),
    createEnrollment: jest.fn(),
    claim: jest.fn(),
  };
  const context = {
    ...spy.context,
    getMqttServerConfig: jest.fn().mockResolvedValue({ host: 'mock.invalid', port: 8883, useTls: true }),
    getMqttCredentialProvisioning: jest
      .fn()
      .mockReturnValue({ availableProviders: jest.fn().mockResolvedValue([{ providerId: 'mock' }]) }),
    secrets: { encrypt: jest.fn().mockReturnValue('ciphertext'), decrypt: jest.fn().mockReturnValue(verifier) },
    logger: { warn: jest.fn() },
  };
  const service = new Service(context as unknown as PluginContext, wago as unknown as WagoService);
  service['sessions'] = spy.spied.commissioningSessions as never;
  const inspect = jest.fn().mockRejectedValue(new Error('arbitrary-secret'));
  const sudo = jest.fn().mockResolvedValue('');
  service['inspect'] = inspect;
  service['sudoRun'] = sudo;
  return {
    service,
    session,
    stored: (id = 1) => storage.tables.commissioningSessions.get(id),
    storage,
    /** The spied record port: `spied.commissioningSessions.find` and the other tables. */
    spied: spy.spied,
    writes: spy.writes,
    wago,
    context,
    inspect,
    sudo,
  };
}
