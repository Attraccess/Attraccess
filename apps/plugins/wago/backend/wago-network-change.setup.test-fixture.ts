import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { DataSource } from 'typeorm';
import type { PluginContext, PluginMqttMessage } from '@attraccess/plugins-backend-sdk';
import { WagoNetworkChangeService } from './wago-network-change.service';
import { WagoNetworkChange, WagoMqttCredentialRetirement } from './wago-network-change.entity';
import { WagoManagedAccess, WagoRuntimeUpdateEntity, WagoDeviceOperation } from './wago-managed-access.entity';
import { WagoController } from './wago-controller.entity';
import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { WagoCredentialRotationEntity } from './wago-credential-rotation.entity';
import { WagoManagedRuntimeService } from './wago-managed-runtime.service';
import { WagoService } from './wago.service';
import { WagoRuntimeArtifactsService } from './wago-runtime-artifacts';
import { WagoCommissioningReadiness } from './wago-commissioning-readiness';
import { RuntimeUpdateError } from './wago-runtime-update';
import { managedSsh } from './wago-managed-ssh';
import { managedHostHelper } from './wago-managed-helper';
import { MANAGED_HELPER_PROTOCOL } from './wago-managed-installer';
import type { BuildRuntimeArtifact } from './wago-build-runtime';

type NetworkChangeFixture = {
  db: DataSource;
  managed: WagoManagedRuntimeService;
  service: WagoNetworkChangeService;
  context: PluginContext;
  listener: (message: PluginMqttMessage) => void;
  payloads: Buffer[];
  provision: jest.Mock;
  audit: jest.Mock;
  revoke: jest.Mock;
  failure: 'host_identity' | 'apply' | 'ack' | null;
  allowEvidence: boolean;
  brokerHost: string;
  oldHost: string;
  fingerprint: string;
  artifact: BuildRuntimeArtifact;
  wago: {
    getSettings: jest.Mock;
    registerRuntimeStatusHandler: jest.Mock;
    blockRuntime: jest.Mock;
    refreshNetworkConnection: jest.Mock;
  };
};
export async function resetTestFixture(scope: NetworkChangeFixture) {
  scope.db = await new DataSource({
    type: 'sqlite',
    database: ':memory:',
    synchronize: true,
    entities: [
      WagoNetworkChange,
      WagoMqttCredentialRetirement,
      WagoManagedAccess,
      WagoRuntimeUpdateEntity,
      WagoDeviceOperation,
      WagoController,
      WagoCommissioningSession,
      WagoCredentialRotationEntity,
    ],
  }).initialize();
  scope.payloads = [];
  scope.failure = null;
  scope.allowEvidence = true;
  scope.brokerHost = 'new-broker.test';
  jest
    .mocked(lookup)
    .mockImplementation(
      async (host: string) =>
        [{ address: host === 'unreachable-old.test' ? '192.168.3.10' : '192.168.4.10', family: 4 }] as never,
    );
  scope.provision = jest.fn(async () => ({
    username: 'wago-controller-cc100-1',
    password: 'device-password-secret',
    providerId: 'fixture',
    identity: 'wago-controller-cc100-1',
    vhost: '/',
  }));
  scope.revoke = jest.fn(async () => {
    throw new Error('unreachable-old-broker');
  });
  scope.audit = jest.fn(async () => ({ status: 'recorded' }));
  scope.context = {
    getRepository: (entity: never) => scope.db.getRepository(entity),
    secrets: {
      encrypt: (s: string) => Buffer.from(s).toString('base64'),
      decrypt: (s: string) => Buffer.from(s, 'base64').toString(),
    },
    getMqttServerConfig: jest.fn(async (id: number) => ({
      id,
      host: id === 1 ? 'unreachable-old.test' : scope.brokerHost,
      port: 1883,
      useTls: false,
    })),
    getMqttCredentialProvisioning: () => ({ provision: scope.provision, revoke: scope.revoke }),
    audit: { record: scope.audit },
    logger: { warn: jest.fn() },
    mqtt: {
      refreshConnection: jest.fn(async () => undefined),
      publish: jest.fn(async () => undefined),
      subscribe: jest.fn(async (_id, _topic, handler) => {
        scope.listener = handler;
        return { unsubscribe: jest.fn() };
      }),
    },
  } as unknown as PluginContext;
  scope.wago = {
    getSettings: jest.fn(async () => ({ operationalPrefix: 'attraccess/wago' })),
    registerRuntimeStatusHandler: jest.fn(),
    blockRuntime: jest.fn(),
    refreshNetworkConnection: jest.fn(async () => undefined),
  };
  scope.managed = new WagoManagedRuntimeService(
    scope.context,
    scope.wago as unknown as WagoService,
    { current: async () => scope.artifact } as WagoRuntimeArtifactsService,
    {} as WagoCommissioningReadiness,
  );
  jest.spyOn(scope.managed as unknown as { scan(): Promise<void> }, 'scan').mockResolvedValue(undefined);
  scope.managed.onApplicationBootstrap();
  scope.managed.registerRootProbe(async () => true);
  const session = await scope.db.getRepository(WagoCommissioningSession).save({
    id: 1,
    hardwareId: 'cc100-1',
    mqttServerId: 1,
    targetHost: scope.oldHost,
    hostKeyFingerprint: scope.fingerprint,
    firmwareBaseline: '31',
    state: 'completed',
    auditLog: '[]',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  jest
    .mocked(managedSsh)
    .mockImplementation(async (_access, _key, header) =>
      header.startsWith('proof ') ? `OK ${header.split(' ')[1]}\n` : 'OK\n',
    );
  await scope.managed.enrol(session, async () => 'OK\n', new AbortController().signal);
  await scope.managed.bind(1, 1);
  await scope.db.getRepository(WagoManagedAccess).update(1, { state: 'managed' });
  await scope.db.getRepository(WagoController).save({
    id: 1,
    hardwareId: 'cc100-1',
    trustState: 'claimed',
    name: 'Workshop',
    mqttServerId: 1,
    credentialMqttServerId: 1,
    credentialEpoch: '11111111-1111-4111-8111-111111111111',
    enrollmentId: 42,
    pairingCodeHash: 'pin',
    fingerprint: scope.fingerprint,
    protocolVersion: '1.0.0',
    runtimeVersion: '0.1.0',
    capabilities: '[]',
    lastSequence: 300,
    lastSeenAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  jest
    .mocked(managedSsh)
    .mockClear()
    .mockImplementation(async (access, _key, header, _signal, file) => {
      if (access.host === scope.oldHost) throw new RuntimeUpdateError('offline');
      if (scope.failure === 'host_identity') throw new RuntimeUpdateError('host_identity');
      if (header.startsWith('proof ')) return `OK ${header.split(' ')[1]}\n`;
      if (header.startsWith('inspect '))
        return `${MANAGED_HELPER_PROTOCOL}\n${createHash('sha256').update(managedHostHelper(scope.artifact)).digest('hex')}\n${scope.artifact.imageId} false\n`;
      if (header.startsWith('mqtt-apply ')) {
        scope.payloads.push(file as Buffer);
        if (scope.failure === 'apply') throw new RuntimeUpdateError('offline');
        const payload = JSON.parse((file as Buffer).toString());
        if (scope.allowEvidence)
          scope.listener({
            serverId: payload.mqttServerId,
            topic: `${payload.prefix}/v1/controllers/${payload.hardwareId}/credentials/rotate/ack`,
            payload: Buffer.from(
              JSON.stringify({
                revision: 1,
                token: payload.token,
                credentialEpoch: payload.credentialEpoch,
                status: 'reconnected',
              }),
            ),
          });
      }
      if (header.startsWith('mqtt-ack ') && scope.failure === 'ack') throw new RuntimeUpdateError('offline');
      return 'OK\n';
    });
  scope.service = new WagoNetworkChangeService(scope.context, scope.managed, scope.wago as unknown as WagoService);
}
