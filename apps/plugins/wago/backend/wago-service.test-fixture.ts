import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoController } from './wago-controller.entity';
import { WagoEnrollment } from './wago-enrollment.entity';
import { WagoService } from './wago.service';
import { WagoSettings } from './wago-settings.entity';
import { WagoConfigurationDraft } from './wago-configuration-draft.entity';
import { WagoConfigurationRevision } from './wago-configuration-revision.entity';
export const controller = (): WagoController => ({
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
  capabilities: '["claim","heartbeat","configuration-v1"]',
  lastSequence: 4,
  lastHeartbeatAt: null,
  lastSeenAt: '2026-01-01T00:00:00.000Z',
  compatibilityError: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});
export function createWagoServiceFixture(
  services: WagoService[],
  controllers = [controller()],
  enrollments: WagoEnrollment[] = [],
  defaultMqttServerId: number | null = null,
) {
  const controllerRepository = {
    find: jest.fn().mockResolvedValue(controllers),
    findOneBy: jest
      .fn()
      .mockImplementation(
        async (where) =>
          controllers.find((item) => ('id' in where ? item.id === where.id : item.hardwareId === where.hardwareId)) ??
          null,
      ),
    save: jest.fn().mockImplementation(async (value) => value),
    delete: jest.fn(),
  };
  const enrollmentQuery = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(enrollments),
  };
  const enrollmentRepository = {
    find: jest.fn().mockResolvedValue(enrollments),
    findOneBy: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn().mockImplementation(async (value) => value),
    delete: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue(enrollmentQuery),
  };
  const settingsRepository = {
    findOneBy: jest.fn().mockResolvedValue({ id: 1, defaultMqttServerId, operationalPrefix: 'attraccess/wago' }),
    save: jest.fn(),
    findOneByOrFail: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const draftRepository = {
    findOneBy: jest.fn().mockResolvedValue(null),
    create: jest.fn((value) => value),
    save: jest.fn().mockImplementation(async (value) => value),
    delete: jest.fn(),
  };
  const revisionRepository = {
    find: jest.fn().mockResolvedValue([]),
    findOneBy: jest.fn().mockResolvedValue(null),
    create: jest.fn((value) => value),
    save: jest.fn().mockImplementation(async (value) => value),
    delete: jest.fn(),
  };
  const settingsQuery = {
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    orIgnore: jest.fn().mockReturnThis(),
    execute: jest.fn(),
  };
  settingsRepository.createQueryBuilder.mockReturnValue(settingsQuery);
  const subscriptions: Array<{ unsubscribe: jest.Mock }> = [];
  const flowQuery = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
  };
  const context = {
    dataSource: { getRepository: () => ({ createQueryBuilder: () => flowQuery }) },
    getRepository: jest.fn((entity) => {
      if (entity === WagoController) return controllerRepository;
      if (entity === WagoEnrollment) return enrollmentRepository;
      if (entity === WagoSettings) return settingsRepository;
      if (entity === WagoConfigurationDraft) return draftRepository;
      if (entity === WagoConfigurationRevision) return revisionRepository;
      throw new Error('unexpected repository');
    }),
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
    controllers: controllerRepository,
    settings: settingsRepository,
    enrollments: enrollmentRepository,
    drafts: draftRepository,
    revisions: revisionRepository,
  });
  return {
    service,
    controllerRepository,
    enrollmentRepository,
    settingsRepository,
    settingsQuery,
    draftRepository,
    revisionRepository,
    context,
    subscriptions,
  };
}
