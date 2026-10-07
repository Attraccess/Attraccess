import { Setting, entities } from '@attraccess/database-entities';
import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { copyFile, mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { AuditService } from '../../../api/src/audit/audit.service';
import { EncryptionService } from '../../../api/src/encryption/encryption.service';
import { createPluginAuditContext } from '../../../api/src/plugin-system/plugin-audit-context';
import { SettingsStoreService } from '../../../api/src/settings/settings-store.service';
import { fw31IdentityOutput } from '../backend/fixtures/fw31-identity';
import plugin from '../backend/plugin';
import { CLOCK_INSPECTION_SCRIPT } from '../backend/wago-commissioning-clock';
import { WagoCommissioningSession } from '../backend/wago-commissioning-session.entity';
import { WagoCommissioningService } from '../backend/wago-commissioning.service';
import { WAGO_HARDWARE_PROFILE } from '../backend/wago-hardware-deployment';
import type { RuntimeArtifactManifest } from '../backend/wago-runtime-artifacts';
import { WagoRuntimeArtifactsService } from '../backend/wago-runtime-artifacts';
import { WagoService } from '../backend/wago.service';
import { FixtureMqtt, pluginId, privateValue, verifier } from './audit-hooks.integration-globals.test-utils';

import { AuditFixtureState } from './audit-hooks.integration-fixture.test-utils';
export async function AuditBeforeEach(state: AuditFixtureState): Promise<void> {
  state.directory = await mkdtemp(join(tmpdir(), 'wago-audit-hooks-'));
  // Each case gets an independent copy of the fully migrated fixture schema.
  await copyFile(join(state.schemaDirectory, 'schema.sqlite'), join(state.directory, 'fixture.sqlite'));
  state.db = await new DataSource({
    type: 'sqlite',
    database: join(state.directory, 'fixture.sqlite'),
    entities: [...Object.values(entities), ...plugin.entities],
    synchronize: false,
  }).initialize();
  state.audit = new AuditService(state.db, new SettingsStoreService(state.db.getRepository(Setting), null));
  await state.audit.onModuleInit();
  state.mqtt = new FixtureMqtt();
  state.revoke.mockReset().mockResolvedValue(undefined);
  const provision: ReturnType<PluginContext['getMqttCredentialProvisioning']>['provision'] = async (input) => ({
    ...input,
    providerId: 'fixture',
    password: privateValue,
  });
  const encryption = new EncryptionService(
    new ConfigService({ app: { AUTH_SESSION_SECRET: 'isolated-audit-fixture-encryption-key' } }),
  );
  state.context = {
    manifest: { id: pluginId, name: 'wago-fixture', version: '1.0.0', pluginDirectory: state.directory },
    dataSource: state.db,
    getRepository: (entity) => state.db.getRepository(entity),
    audit: createPluginAuditContext(pluginId, () => state.audit),
    mqtt: state.mqtt,
    events: new EventEmitter2(),
    logger: { log: jest.fn(), error: jest.fn(), warn: jest.fn() },
    get: () => {
      throw new Error('Unexpected fixture provider resolution');
    },
    onEvent: () => ({ off: () => undefined }),
    emitEvent: () => undefined,
    flows: { trigger: async () => undefined },
    secrets: {
      encrypt: (value) => encryption.encryptForPlugin(pluginId, value),
      decrypt: (value) => encryption.decryptForPlugin(pluginId, value),
    },
    getMqttServerConfig: async () => ({
      id: 1,
      name: 'fixture',
      host: 'broker.example.test',
      port: 8883,
      useTls: true,
      username: 'fixture',
      password: privateValue,
      clientId: null,
    }),
    getMqttCredentialProvisioning: () => ({
      availableProviders: async () => [{ providerId: 'fixture', displayName: 'fixture' }],
      provision,
      rotate: provision,
      revoke: state.revoke,
    }),
  };
  state.wago = new WagoService(state.context);
  jest.spyOn(state.wago, 'createEnrollment');
  await state.wago.onApplicationBootstrap();
  state.artifacts = new WagoRuntimeArtifactsService();
  jest.spyOn(state.artifacts, 'has').mockResolvedValue(true);
  const artifactDirectory = join(state.directory, 'artifact');
  await mkdir(artifactDirectory);
  const image = `ghcr.io/attraccess/wago-cc100-runtime@sha256:${'a'.repeat(64)}`;
  const artifactManifest: RuntimeArtifactManifest = {
    schemaVersion: 1,
    runtime: 'attraccess-wago-cc100',
    runtimeVersion: '0.1.0',
    protocolVersion: '1.0.0',
    image,
    hardware: {
      model: '751-9301',
      platform: 'linux/arm/v7',
      firmwareBaseline: '31',
      profile: WAGO_HARDWARE_PROFILE,
    },
  };
  jest.spyOn(state.artifacts, 'acquire').mockResolvedValue({
    digest: 'a'.repeat(64),
    bytes: 512,
    image,
    path: join(artifactDirectory, 'runtime.tar'),
    directory: artifactDirectory,
    cleanup: async () => undefined,
    manifest: artifactManifest,
  });
  jest.spyOn(state.artifacts, 'current').mockResolvedValue({
    digest: 'a'.repeat(64),
    bytes: 512,
    image,
    manifest: artifactManifest,
  });
  state.commissioning = new WagoCommissioningService(state.context, state.wago, state.artifacts);
  // Replace only transport boundaries; delivery, inspection, leases and automatic claim remain real.
  state.commissioning['run'] = jest.fn(async (_host, _fingerprint, _credential, _command, input) => {
    if (input === Buffer.from(CLOCK_INSPECTION_SCRIPT).toString('base64')) {
      // Sample at invocation time so the real clock gate verifies fresh, aligned UTC.
      return `epoch=${Math.floor(Date.now() / 1000)}\nuptime=120.00\nboot=11111111-1111-4111-8111-111111111111\ntool=supported\n`;
    }
    return `${fw31IdentityOutput()}\nCODESYS=inactive\n`;
  });
  state.commissioning['copyTo'] = jest.fn(async () => undefined);
  await state.commissioning.onApplicationBootstrap();
  await state.mountApi();
  state.session = await state.db.getRepository(WagoCommissioningSession).save({
    hardwareId: 'audit-fixture',
    mqttServerId: 1,
    targetHost: '10.99.0.1',
    hostKeyFingerprint: `SHA256:${'A'.repeat(43)}`,
    firmwareBaseline: '31',
    controllerName: 'Fixture',
    state: 'awaiting_delivery',
    pairingCode: `encrypted:v1:${state.context.secrets.encrypt(verifier)}`,
    auditLog: '[]',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    runtimeArtifactDigest: 'a'.repeat(64),
  });
}
