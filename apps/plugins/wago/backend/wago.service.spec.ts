import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoController } from './wago-controller.entity';
import { WagoEnrollment } from './wago-enrollment.entity';
import { WagoService } from './wago.service';
import { WagoSettings } from './wago-settings.entity';

describe('WagoService', () => {
  const controller = (): WagoController => ({
    id: 1,
    hardwareId: 'cc100-01',
    trustState: 'untrusted',
    name: null,
    mqttServerId: 2,
    enrollmentId: 3,
    pairingCodeHash: 'pairing-hash',
    fingerprint: '',
    protocolVersion: '1.0.0',
    runtimeVersion: '1.0.0',
    capabilities: '["claim","heartbeat"]',
    lastSequence: 4,
    lastHeartbeatAt: null,
    lastSeenAt: '2026-01-01T00:00:00.000Z',
    compatibilityError: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });

  function createService(controllers = [controller()]) {
    const controllerRepository = {
      find: jest.fn().mockResolvedValue(controllers),
      findOneBy: jest.fn().mockResolvedValue(controllers[0] ?? null),
      save: jest.fn().mockImplementation(async (value) => value),
    };
    const enrollmentRepository = { find: jest.fn().mockResolvedValue([]), findOneBy: jest.fn(), save: jest.fn() };
    const settingsRepository = { findOneBy: jest.fn().mockResolvedValue({ id: 1, defaultMqttServerId: null }), save: jest.fn() };
    const context = {
      getRepository: jest.fn((entity) => {
        if (entity === WagoController) return controllerRepository;
        if (entity === WagoEnrollment) return enrollmentRepository;
        if (entity === WagoSettings) return settingsRepository;
        throw new Error('unexpected repository');
      }),
      logger: { warn: jest.fn() },
      mqtt: { subscribe: jest.fn(), publish: jest.fn() },
      getMqttCredentialProvisioning: jest.fn(),
    } as unknown as PluginContext;
    return { service: new WagoService(context), controllerRepository };
  }

  it('does not expose physical-verification secrets in controller listings', async () => {
    const { service } = createService();

    const [listed] = await service.list();

    expect(listed).not.toHaveProperty('fingerprint');
    expect(listed).not.toHaveProperty('pairingCodeHash');
  });

  it('requires a non-empty matching fingerprint', () => {
    const { service } = createService();
    const matchesVerifier = Reflect.get(service, 'matchesVerifier') as (item: WagoController, value: string) => boolean;

    expect(matchesVerifier(controller(), '')).toBe(false);
  });

  it('accepts a heartbeat that omits the optional sequence', async () => {
    const claimed = { ...controller(), trustState: 'claimed' as const };
    const { service, controllerRepository } = createService([claimed]);
    const onHeartbeat = (Reflect.get(service, 'onHeartbeat') as (hardwareId: string, payload: Buffer) => Promise<void>).bind(
      service,
    );

    await onHeartbeat(
      claimed.hardwareId,
      Buffer.from(
        JSON.stringify({
          hardwareId: claimed.hardwareId,
          pairingCode: '482931',
          protocolVersion: '1.0.0',
          runtimeVersion: '1.0.0',
          capabilities: ['claim', 'heartbeat'],
        }),
      ),
    );

    expect(controllerRepository.save).toHaveBeenCalledWith(expect.objectContaining({ lastSequence: 4 }));
  });
});
