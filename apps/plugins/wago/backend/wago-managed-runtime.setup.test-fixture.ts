import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { DataSource } from 'typeorm';
import { PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoManagedRuntimeService } from './wago-managed-runtime.service';
import { WagoManagedAccess, WagoRuntimeUpdateEntity, WagoDeviceOperation } from './wago-managed-access.entity';
import { WagoNetworkChange, WagoMqttCredentialRetirement } from './wago-network-change.entity';
import { WagoController } from './wago-controller.entity';
import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { WagoService } from './wago.service';
import { WagoRuntimeArtifactsService } from './wago-runtime-artifacts';
import { WagoCommissioningReadiness } from './wago-commissioning-readiness';
import { managedSsh } from './wago-managed-ssh';
import type { BuildRuntimeArtifact } from './wago-build-runtime';

export type ManagedRuntimeFixture = {
  db: DataSource;
  service: WagoManagedRuntimeService;
  encrypt: jest.Mock;
  decrypt: jest.Mock;
  audit: jest.Mock;
  rootProbe: jest.Mock;
  context: PluginContext;
  artifact: BuildRuntimeArtifact;
  principal: { userId: number; authenticationMethod: 'session' };
  session: (id?: number) => WagoCommissioningSession;
};
export async function resetTestFixture(scope: ManagedRuntimeFixture) {
  scope.db = await new DataSource({
    type: 'sqlite',
    database: ':memory:',
    entities: [
      WagoManagedAccess,
      WagoNetworkChange,
      WagoMqttCredentialRetirement,
      WagoRuntimeUpdateEntity,
      WagoDeviceOperation,
      WagoController,
      WagoCommissioningSession,
    ],
    synchronize: true,
  }).initialize();
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
    getRepository: (entity: never) => scope.db.getRepository(entity),
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
