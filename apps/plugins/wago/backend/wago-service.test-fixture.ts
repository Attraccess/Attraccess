import type { PluginBackendAdapters } from '@attraccess/plugins-backend-sdk/adapter';
import type {
  PluginContext as NeutralPluginContext,
  PluginPersistenceContext,
  PluginOperationToken,
} from '@attraccess/plugins-backend-sdk/v2';
import plugin from './plugin';
import { createWagoRegistryPersistence } from './controllers/persistence/typeorm-adapter';
import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoController } from './controllers/entity';
import { WagoEnrollment } from './controllers/enrollment.entity';
import { WagoService } from './controllers/service';
import { WagoSettings } from './controllers/settings.entity';
import { WagoConfigurationDraft } from './configuration/draft.entity';
import { WagoConfigurationRevision } from './configuration/revision.entity';
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
    save: jest.fn().mockImplementation(async (value) => {
      const existing = controllers.find((row) => row.id === value.id);
      if (existing) Object.assign(existing, value);
      return value;
    }),
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
    save: jest.fn().mockImplementation(async (value) => {
      const existing = enrollments.find((row) => row.id === value.id);
      if (existing) Object.assign(existing, value);
      return value;
    }),
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
  const service = ((context: PluginContext) => new WagoService(context, ...createWagoRegistryPersistence(context)))(
    context,
  );
  services.push(service);
  // Unit tests invoke service methods directly, outside Nest's module lifecycle.
  Object.assign(service, {
    controllers: controllerRepository,
    settings: settingsRepository,
    enrollments: enrollmentRepository,
    drafts: draftRepository,
    revisions: revisionRepository,
  });
  bindWagoPersistenceFixture(service, context);
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

/** Bind the existing repository fakes to real adapters; application services receive only ports. */
export function bindWagoPersistenceFixture(service: WagoService, context: PluginContext): void {
  const records = service as unknown as Record<string, object>;
  const names = new Map<unknown, string>([
    [WagoController, 'controllers'],
    [WagoEnrollment, 'enrollments'],
    [WagoSettings, 'settings'],
    [WagoConfigurationDraft, 'drafts'],
    [WagoConfigurationRevision, 'revisions'],
  ]);
  const implementationContext = {
    get dataSource() {
      return context.dataSource;
    },
    getRepository: (entity: unknown) => {
      const repository = records[names.get(entity) ?? ''];
      if (!repository) throw new Error('Fixture has no repository for this operation');
      return { ...repository, create: (input: unknown) => input };
    },
  } as unknown as PluginContext;
  const [registry, configuration] = createWagoRegistryPersistence(implementationContext);
  Object.assign(service, { registry, configuration });
  Object.assign(service['commands']['dependencies'], { registry, configuration });
}

/** Exercise the v2 registration with real adapter factories, without exposing fixture connections to services. */
export function withWagoPersistenceFixture(
  context: PluginContext,
  implementation: PluginBackendAdapters = plugin,
): NeutralPluginContext {
  const instances = new Map<symbol, object>();
  const targets = new Map<symbol, object>();
  const persistence: PluginPersistenceContext = {
    resolve: <T>(token: PluginOperationToken<T>): T => {
      if (!instances.has(token.id)) {
        const operation = implementation.persistenceAdapters
          .flatMap((entry) => entry.operations ?? [])
          .find((entry) => entry.token.id === token.id);
        if (!operation) throw new Error(`Fixture has no registered operation: ${token.description}`);
        instances.set(
          token.id,
          new Proxy(
            {},
            {
              get: (_target, key) => {
                if (!token.methods.includes(key)) return undefined;
                return (...args: unknown[]) => {
                  if (!targets.has(token.id)) {
                    const source = context.dataSource;
                    if (!source?.isInitialized) throw new Error('Fixture database is not initialized');
                    targets.set(
                      token.id,
                      operation.create({ backend: 'sqlite', dataSource: source, manager: source.manager }) as object,
                    );
                  }
                  const target = targets.get(token.id);
                  return Reflect.apply(Reflect.get(target, key), target, args);
                };
              },
            },
          ),
        );
      }
      return instances.get(token.id) as T;
    },
  };
  const neutral = { ...context, persistence };
  Reflect.deleteProperty(neutral, 'getRepository');
  Reflect.deleteProperty(neutral, 'dataSource');
  Reflect.deleteProperty(neutral, 'get');
  return neutral as unknown as NeutralPluginContext;
}
