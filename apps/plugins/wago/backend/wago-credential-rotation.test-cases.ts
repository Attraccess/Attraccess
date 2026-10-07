// eslint-disable-next-line @nx/enforce-module-boundaries
import { WagoRuntime } from '../cc100-runtime/src/runtime';
// eslint-disable-next-line @nx/enforce-module-boundaries
import type { RuntimeState } from '../cc100-runtime/src/runtime';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { MemoryDeviceAdapter } from '../cc100-runtime/src/adapters';
import type { CredentialRotationWithIsolatedSqliteAndFixtureBrokerTransportTestScope } from './wago-credential-rotation.spec';
import { WagoController } from './wago-controller.entity';
import { WagoCredentialRotation1780010610000 } from './wago-credential-rotation.migration';
import { WagoCredentialRotationUncertainError } from './wago-credential-rotation';

export function registerComposesTheRealBackendAndRuntimeAcrossPersistenceFixtureAuthenticationAndReconnectAcknow(
  scope: CredentialRotationWithIsolatedSqliteAndFixtureBrokerTransportTestScope,
): void {
  it('composes the real backend and runtime across persistence, fixture authentication and reconnect acknowledgement', async () => {
    let persisted: RuntimeState = {
      credentials: {
        username: scope.identity,
        password: 'old-fixture',
        prefix: 'attraccess/wago',
        credentialEpoch: scope.credentialEpoch,
      },
      outputs: {},
      commandIds: [],
    };
    const listeners = new Map<string, (payload: Buffer) => void | Promise<void>>();
    let authenticatedPassword = 'old-fixture';
    const runtime = new WagoRuntime({
      hardwareId: 'fixture',
      prefix: 'attraccess/wago',
      pairingCode: 'fixture',
      store: {
        load: async () => structuredClone(persisted),
        save: async (state) => {
          persisted = structuredClone(state);
        },
      },
      device: new MemoryDeviceAdapter(),
      transport: {
        subscribe: async (topic, handler) => {
          listeners.set(topic, handler);
        },
        publish: async (topic, payload) => {
          if (topic.endsWith('/credentials/rotate/ack')) {
            expect(authenticatedPassword).toBe(scope.credential.password);
            await scope.receive({ serverId: 2, topic, payload: Buffer.from(JSON.stringify(payload)) });
          }
        },
      },
      reconnectCredentials: async (next) => {
        expect(persisted.credentials).toEqual(next);
        // Fixture authentication accepts only the password actually returned by the broker mutation.
        if (next.password !== scope.credential.password) throw new Error('fixture_authentication_failed');
        authenticatedPassword = next.password;
        await runtime.acknowledgeCredentialRotation(next);
      },
    });
    await runtime.start();
    scope.publish.mockImplementation(async (_serverId, topic, payload) => {
      await listeners.get(topic)?.(Buffer.from(payload));
    });
    await expect(scope.service.rotate(1, 'attraccess/wago', scope.principal, scope.guard())).resolves.toEqual({
      state: 'completed',
      revision: 1,
    });
    expect(persisted.credentials?.password).toBe(scope.credential.password);
    expect((await scope.row())?.encryptedCredentials).toBeNull();
  });
}

export function registerCreatesTheActualMigrationAndClearsRecoveryStateOnlyWhenItsControllerRegistrationIsDele(
  scope: CredentialRotationWithIsolatedSqliteAndFixtureBrokerTransportTestScope,
): void {
  it('creates the actual migration and clears recovery state only when its controller registration is deleted', async () => {
    const runner = scope.db.createQueryRunner();
    await runner.query('DROP TABLE "plugin_wago_credential_rotations"');
    await runner.query('ALTER TABLE plugin_wago_controllers DROP COLUMN credential_epoch');
    const migration = new WagoCredentialRotation1780010610000();
    await migration.up(runner);
    await scope.db.query('UPDATE plugin_wago_controllers SET credential_epoch = ? WHERE id = 1', [
      scope.credentialEpoch,
    ]);
    await scope.service.rotate(1, 'attraccess/wago', scope.principal, scope.guard());
    expect(await scope.service.status(1)).toEqual({ state: 'completed', revision: 1 });
    await expect(migration.down(runner)).rejects.toThrow('rotation history');
    await scope.db.getRepository(WagoController).delete(1);
    expect(await scope.row()).toBeNull();
    await migration.down(runner);
    await runner.release();
  });
}

export function registerDoesNotCallManualInstructionsACompletedRotation(
  scope: CredentialRotationWithIsolatedSqliteAndFixtureBrokerTransportTestScope,
): void {
  it('does not call manual instructions a completed rotation', async () => {
    scope.rotate.mockResolvedValue({ username: scope.identity, instructions: ['synthetic-manual-instruction'] });
    await expect(scope.service.rotate(1, 'attraccess/wago', scope.principal, scope.guard())).rejects.toThrow(
      'incomplete',
    );
    expect(await scope.row()).toBeNull();
    expect(scope.publish).not.toHaveBeenCalled();
    expect(JSON.stringify(scope.record.mock.calls)).not.toContain('synthetic-manual-instruction');
  });
}

export function registerDoesNotFinishAfterLeaseLossDuringTheHandoff(
  scope: CredentialRotationWithIsolatedSqliteAndFixtureBrokerTransportTestScope,
): void {
  it('does not finish after lease loss during the handoff', async () => {
    scope.publish.mockImplementation(async () => {
      scope.owned = false;
      scope.abort.abort();
    });
    await expect(scope.service.rotate(1, 'attraccess/wago', scope.principal, scope.guard())).rejects.toThrow(
      'incomplete',
    );
    expect((await scope.row())?.phase).toBe('pending');
    expect(scope.unsubscribe).toHaveBeenCalledTimes(1);
  });
}

export function registerGuardsOriginalBrokerRemovalAndRejectsDowngradeOfAnyRotationHistory(
  scope: CredentialRotationWithIsolatedSqliteAndFixtureBrokerTransportTestScope,
): void {
  it('guards original-broker removal and rejects downgrade of any rotation history', async () => {
    await scope.service.rotate(1, 'attraccess/wago', scope.principal, scope.guard());
    await expect(scope.service.assertRemovalBroker(1, 9)).rejects.toThrow('original rotation broker');
    await expect(scope.service.assertRemovalBroker(1, 2)).resolves.toBeUndefined();
    const runner = scope.db.createQueryRunner();
    await expect(new WagoCredentialRotation1780010610000().down(runner)).rejects.toThrow('rotation history');
    expect((await scope.row())?.revision).toBe(1);
    await runner.release();
  });
}

export function registerPersistsEncryptedHandoffAndRequiresReconnectAcknowledgementWithIMsClockSkew(
  scope: CredentialRotationWithIsolatedSqliteAndFixtureBrokerTransportTestScope,
): void {
  it.each([0, 2100])(
    'persists encrypted handoff and requires reconnect acknowledgement with %i ms clock skew',
    async (skew) => {
      await scope.db
        .getRepository(WagoController)
        .update(1, { lastHeartbeatAt: new Date(Date.now() + skew).toISOString() });
      let acknowledge!: () => Promise<void>;
      let started!: () => void;
      const dispatched = new Promise<void>((resolve) => {
        started = resolve;
      });
      scope.publish.mockImplementation(async (serverId, topic, payload, options) => {
        expect(options).toEqual({ qos: 1, retain: false });
        const persisted = await scope.row();
        expect(persisted?.phase).toBe('pending');
        expect(persisted?.encryptedCredentials).not.toContain(scope.credential.password);
        const { revision, token } = JSON.parse(payload);
        acknowledge = async () => {
          await scope.receive({
            serverId,
            topic: `${topic}/ack`,
            payload: Buffer.from(
              JSON.stringify({ revision, token, credentialEpoch: scope.credentialEpoch, status: 'reconnected' }),
            ),
          });
        };
        await scope.receive({
          serverId,
          topic: `${topic}/ack`,
          payload: Buffer.from(
            JSON.stringify({ revision, token: 'wrong', credentialEpoch: scope.credentialEpoch, status: 'reconnected' }),
          ),
        });
        started();
      });
      const operation = scope.service.rotate(1, 'attraccess/wago', scope.principal, scope.guard());
      await dispatched;
      expect((await scope.row())?.phase).toBe('pending');
      expect(scope.record.mock.calls.map(([event]) => event.outcome)).not.toContain('succeeded');
      await acknowledge();
      await expect(operation).resolves.toEqual({ state: 'completed', revision: 1 });
      expect(await scope.row()).toMatchObject({ phase: 'completed', encryptedCredentials: null });
      expect(scope.unsubscribe).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(scope.record.mock.calls)).not.toContain(scope.credential.password);
      expect(scope.rotate).toHaveBeenCalledWith(
        expect.objectContaining({
          topicPolicy: expect.objectContaining({
            subscribe: expect.arrayContaining(['attraccess/wago/v1/controllers/fixture/credentials/rotate']),
          }),
        }),
      );
    },
  );
}

export function registerPreservesUncertainProvisioningAndRefusesToRepeatProviderMutationAfterOwnershipLoss(
  scope: CredentialRotationWithIsolatedSqliteAndFixtureBrokerTransportTestScope,
): void {
  it('preserves uncertain provisioning and refuses to repeat provider mutation after ownership loss', async () => {
    scope.rotate.mockImplementation(async () => {
      scope.owned = false;
      return scope.credential;
    });
    await expect(scope.service.rotate(1, 'attraccess/wago', scope.principal, scope.guard())).rejects.toThrow(
      'incomplete',
    );
    expect(await scope.row()).toMatchObject({ phase: 'provisioning', encryptedCredentials: null });
    expect(scope.publish).not.toHaveBeenCalled();
    scope.owned = true;
    await expect(scope.service.rotate(1, 'attraccess/wago', scope.principal, scope.guard(), true)).rejects.toThrow(
      'uncertain',
    );
    expect(scope.rotate).toHaveBeenCalledTimes(1);
  });
}

export function registerRefusesAClaimedControllerWithoutFreshPermanentHeartbeatEvidenceP(
  scope: CredentialRotationWithIsolatedSqliteAndFixtureBrokerTransportTestScope,
): void {
  it.each([
    null,
    'invalid',
    new Date(Date.now() - 90_001).toISOString(),
    new Date(Date.now() + 3_600_000).toISOString(),
  ])('refuses a claimed controller without fresh permanent heartbeat evidence (%p)', async (lastHeartbeatAt) => {
    await scope.db.getRepository(WagoController).update(1, { lastHeartbeatAt });
    await expect(scope.service.rotate(1, 'attraccess/wago', scope.principal, scope.guard())).rejects.toThrow(
      'permanent controller heartbeat',
    );
    expect(scope.rotate).not.toHaveBeenCalled();
    expect(scope.publish).not.toHaveBeenCalled();
    expect(scope.record).not.toHaveBeenCalled();
    expect(await scope.row()).toBeNull();
  });
}

export function registerRefusesOldRuntimeCapabilitiesBeforeTouchingBrokerCredentialsOrAudit(
  scope: CredentialRotationWithIsolatedSqliteAndFixtureBrokerTransportTestScope,
): void {
  it('refuses old runtime capabilities before touching broker credentials or audit', async () => {
    await scope.db.getRepository(WagoController).update(1, { capabilities: '["commands"]' });
    await expect(scope.service.rotate(1, 'attraccess/wago', scope.principal, scope.guard())).rejects.toThrow(
      'credential-rotation-v1',
    );
    expect(scope.rotate).not.toHaveBeenCalled();
    expect(scope.record).not.toHaveBeenCalled();
    expect(await scope.row()).toBeNull();
  });
}

export function registerReturnsTheTypedUncertainErrorWhenMqttDispatchStallsPastItsDeadline(
  scope: CredentialRotationWithIsolatedSqliteAndFixtureBrokerTransportTestScope,
): void {
  it('returns the typed uncertain error when MQTT dispatch stalls past its deadline', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    let entered!: () => void;
    let finish!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    scope.publish.mockImplementation(async () => {
      entered();
      await pending;
    });
    const operation = scope.service.rotate(1, 'attraccess/wago', scope.principal, scope.guard());
    const rejected = expect(operation).rejects.toBeInstanceOf(WagoCredentialRotationUncertainError);
    await started;
    const payload = JSON.parse(scope.publish.mock.calls[0][2]);
    expect(Date.parse(payload.expiresAt) - Date.now()).toBeLessThanOrEqual(30_000);
    await jest.advanceTimersByTimeAsync(30_000);
    await rejected;
    finish();
    expect((await scope.row())?.phase).toBe('pending');
  });
}
