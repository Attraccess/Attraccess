import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import type { PluginContext, PluginMqttMessage } from '@attraccess/plugins-backend-sdk';
import { WagoController } from './wago-controller.entity';
import { WagoCredentialRotationEntity } from './wago-credential-rotation.entity';
import { WagoCredentialRotationService } from './wago-credential-rotation';
import { registerPersistsEncryptedHandoffAndRequiresReconnectAcknowledgementWithIMsClockSkew } from './wago-credential-rotation.test-cases';
import { registerTimesOutThenRetriesTheSameDurableCredentialAndTokenAfterServiceRestartWithoutRotating } from './wago-credential-rotation.times-out-then-retries-the-same-durable-credential-and-token-after-service-restart-without-rotating-.test-cases';
import { registerPreservesUncertainProvisioningAndRefusesToRepeatProviderMutationAfterOwnershipLoss } from './wago-credential-rotation.test-cases';
import { registerDoesNotFinishAfterLeaseLossDuringTheHandoff } from './wago-credential-rotation.test-cases';
import { registerRefusesOldRuntimeCapabilitiesBeforeTouchingBrokerCredentialsOrAudit } from './wago-credential-rotation.test-cases';
import { registerRefusesAClaimedControllerWithoutFreshPermanentHeartbeatEvidenceP } from './wago-credential-rotation.test-cases';
import { registerReturnsTheTypedUncertainErrorWhenMqttDispatchStallsPastItsDeadline } from './wago-credential-rotation.test-cases';
import { registerDoesNotCallManualInstructionsACompletedRotation } from './wago-credential-rotation.test-cases';
import { registerGuardsOriginalBrokerRemovalAndRejectsDowngradeOfAnyRotationHistory } from './wago-credential-rotation.test-cases';
import { registerCreatesTheActualMigrationAndClearsRecoveryStateOnlyWhenItsControllerRegistrationIsDele } from './wago-credential-rotation.test-cases';
import { registerComposesTheRealBackendAndRuntimeAcrossPersistenceFixtureAuthenticationAndReconnectAcknow } from './wago-credential-rotation.test-cases';

describe('credential rotation with isolated SQLite and fixture broker transport', () => {
  defineCredentialRotationWithIsolatedSqliteAndFixtureBrokerTransportTests();
});

export function defineCredentialRotationWithIsolatedSqliteAndFixtureBrokerTransportTests() {
  let db: DataSource;
  let directory: string;
  let service: WagoCredentialRotationService;
  let context: PluginContext;
  let receive: (message: PluginMqttMessage) => void | Promise<void>;
  let owned: boolean;
  let abort: AbortController;
  const principal = { userId: 12, authenticationMethod: 'session' as const };
  const identity = 'wago-controller-fixture';
  const credentialEpoch = '11111111-1111-4111-8111-111111111111';
  const credential = {
    providerId: 'fixture',
    identity,
    username: identity,
    password: 'synthetic-rotation-secret',
    vhost: '/',
  };
  const rotate = jest.fn();
  const publish = jest.fn();
  const record = jest.fn();
  const unsubscribe = jest.fn();
  const guard = () => ({
    assertOwned: async () => {
      if (!owned) throw new Error('lease_lost');
    },
    signal: abort.signal,
    deadline: Date.now() + 60_000,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    owned = true;
    abort = new AbortController();
    directory = await mkdtemp(join(tmpdir(), 'wago-rotation-database-'));
    db = await new DataSource({
      type: 'sqlite',
      database: join(directory, 'rotation.sqlite'),
      entities: [WagoController, WagoCredentialRotationEntity],
      synchronize: true,
    }).initialize();
    await db.getRepository(WagoController).save({
      id: 1,
      hardwareId: 'fixture',
      trustState: 'claimed',
      mqttServerId: 2,
      name: 'Fixture',
      pairingCodeHash: '',
      protocolVersion: '1.0.0',
      runtimeVersion: '0.1.0',
      capabilities: '["credential-rotation-v1"]',
      lastHeartbeatAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const columns = await db.query('PRAGMA table_info(plugin_wago_controllers)');
    if (!columns.some((column: { name: string }) => column.name === 'credential_epoch'))
      await db.query('ALTER TABLE plugin_wago_controllers ADD COLUMN credential_epoch varchar');
    await db.query('UPDATE plugin_wago_controllers SET credential_epoch = ? WHERE id = 1', [credentialEpoch]);
    const key = randomBytes(32);
    context = {
      getRepository: (entity) => db.getRepository(entity),
      getMqttCredentialProvisioning: () => ({ rotate }),
      mqtt: {
        publish,
        subscribe: async (_server, _topic, handler) => {
          receive = handler;
          return { unsubscribe };
        },
      },
      audit: { record },
      logger: { warn: jest.fn() },
      secrets: {
        encrypt: (plaintext) => {
          const iv = randomBytes(12);
          const cipher = createCipheriv('aes-256-gcm', key, iv);
          const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
          return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
        },
        decrypt: (encrypted) => {
          const bytes = Buffer.from(encrypted, 'base64');
          const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
          decipher.setAuthTag(bytes.subarray(12, 28));
          return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8');
        },
      },
    } as unknown as PluginContext;
    rotate.mockResolvedValue(credential);
    record.mockResolvedValue({ status: 'recorded' });
    publish.mockImplementation(async (serverId, topic, payload) => {
      const { revision, token } = JSON.parse(payload);
      await receive({
        serverId,
        topic: `${topic}/ack`,
        payload: Buffer.from(JSON.stringify({ revision, token, credentialEpoch, status: 'reconnected' })),
      });
    });
    service = new WagoCredentialRotationService(context);
  });
  afterEach(async () => {
    jest.useRealTimers();
    await db.destroy();
    await rm(directory, { recursive: true, force: true });
  });

  const row = () =>
    db
      .getRepository(WagoCredentialRotationEntity)
      .createQueryBuilder('rotation')
      .addSelect('rotation.encryptedCredentials')
      .getOne();
  const scope = {
    get db() {
      return db;
    },
    set db(value: typeof db) {
      db = value;
    },
    get publish() {
      return publish;
    },
    get row() {
      return row;
    },
    get credential() {
      return credential;
    },
    get receive() {
      return receive;
    },
    set receive(value: typeof receive) {
      receive = value;
    },
    get credentialEpoch() {
      return credentialEpoch;
    },
    get service() {
      return service;
    },
    set service(value: typeof service) {
      service = value;
    },
    get principal() {
      return principal;
    },
    get guard() {
      return guard;
    },
    get record() {
      return record;
    },
    get unsubscribe() {
      return unsubscribe;
    },
    get rotate() {
      return rotate;
    },
    get directory() {
      return directory;
    },
    set directory(value: typeof directory) {
      directory = value;
    },
    get context() {
      return context;
    },
    set context(value: typeof context) {
      context = value;
    },
    get owned() {
      return owned;
    },
    set owned(value: typeof owned) {
      owned = value;
    },
    get abort() {
      return abort;
    },
    set abort(value: typeof abort) {
      abort = value;
    },
    get identity() {
      return identity;
    },
  };

  registerPersistsEncryptedHandoffAndRequiresReconnectAcknowledgementWithIMsClockSkew(scope);

  registerTimesOutThenRetriesTheSameDurableCredentialAndTokenAfterServiceRestartWithoutRotating(scope);

  registerPreservesUncertainProvisioningAndRefusesToRepeatProviderMutationAfterOwnershipLoss(scope);

  registerDoesNotFinishAfterLeaseLossDuringTheHandoff(scope);

  registerRefusesOldRuntimeCapabilitiesBeforeTouchingBrokerCredentialsOrAudit(scope);

  it('requires the persisted registration epoch before any broker mutation', async () => {
    await db.query('UPDATE plugin_wago_controllers SET credential_epoch = NULL WHERE id = 1');
    await expect(service.rotate(1, 'attraccess/wago', principal, guard())).rejects.toThrow('credential epoch');
    expect(rotate).not.toHaveBeenCalled();
  });

  registerRefusesAClaimedControllerWithoutFreshPermanentHeartbeatEvidenceP(scope);

  registerReturnsTheTypedUncertainErrorWhenMqttDispatchStallsPastItsDeadline(scope);

  registerDoesNotCallManualInstructionsACompletedRotation(scope);

  registerGuardsOriginalBrokerRemovalAndRejectsDowngradeOfAnyRotationHistory(scope);

  registerCreatesTheActualMigrationAndClearsRecoveryStateOnlyWhenItsControllerRegistrationIsDele(scope);

  registerComposesTheRealBackendAndRuntimeAcrossPersistenceFixtureAuthenticationAndReconnectAcknow(scope);

  return scope;
}

export type CredentialRotationWithIsolatedSqliteAndFixtureBrokerTransportTestScope = ReturnType<
  typeof defineCredentialRotationWithIsolatedSqliteAndFixtureBrokerTransportTests
>;
