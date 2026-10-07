import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { WagoController } from './wago-controller.entity';
import { WagoCredentialRotationEntity } from './wago-credential-rotation.entity';
import { WagoCredentialRotationService, WagoCredentialRotationUncertainError } from './wago-credential-rotation';
import type { CredentialRotationWithIsolatedSqliteAndFixtureBrokerTransportTestScope } from './wago-credential-rotation.spec';

export function registerTimesOutThenRetriesTheSameDurableCredentialAndTokenAfterServiceRestartWithoutRotating(
  scope: CredentialRotationWithIsolatedSqliteAndFixtureBrokerTransportTestScope,
): void {
  it('times out, then retries the same durable credential and token after service restart without rotating again', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    let started!: () => void;
    const dispatched = new Promise<void>((resolve) => {
      started = resolve;
    });
    scope.publish.mockImplementation(async () => {
      started();
    });
    const operation = scope.service.rotate(1, 'attraccess/wago', scope.principal, scope.guard());
    const failure = expect(operation).rejects.toBeInstanceOf(WagoCredentialRotationUncertainError);
    await dispatched;
    const firstPayload = scope.publish.mock.calls[0][2];
    await jest.advanceTimersByTimeAsync(30_000);
    await failure;
    expect((await scope.row())?.phase).toBe('pending');
    jest.useRealTimers();
    await scope.db.destroy();
    scope.db = await new DataSource({
      type: 'sqlite',
      database: join(scope.directory, 'rotation.sqlite'),
      entities: [WagoController, WagoCredentialRotationEntity],
      synchronize: false,
    }).initialize();
    // Recovery resends the already rotated credential even when liveness has been lost.
    await scope.db.getRepository(WagoController).update(1, { lastHeartbeatAt: null });
    scope.publish.mockImplementation(async (serverId, topic, payload) => {
      const retried = JSON.parse(payload);
      const first = JSON.parse(firstPayload);
      expect({ ...retried, expiresAt: first.expiresAt }).toEqual(first);
      expect(Date.parse(retried.expiresAt)).toBeGreaterThan(Date.now());
      const { revision, token } = JSON.parse(payload);
      await scope.receive({
        serverId,
        topic: `${topic}/ack`,
        payload: Buffer.from(
          JSON.stringify({ revision, token, credentialEpoch: scope.credentialEpoch, status: 'reconnected' }),
        ),
      });
    });
    await expect(
      new WagoCredentialRotationService(scope.context).rotate(
        1,
        'attraccess/wago',
        scope.principal,
        scope.guard(),
        true,
      ),
    ).resolves.toEqual({ state: 'completed', revision: 1 });
    expect(scope.rotate).toHaveBeenCalledTimes(1);
  });
}
