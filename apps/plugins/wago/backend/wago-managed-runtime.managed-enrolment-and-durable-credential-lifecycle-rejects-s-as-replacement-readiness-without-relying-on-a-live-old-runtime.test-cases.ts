import { WagoManagedAccess } from './wago-managed-access.entity';
import { WagoController } from './wago-controller.entity';
import { ManagedEnrolmentAndDurableCredentialLifecycleTestScope } from './wago-managed-runtime.spec';
export function registerManagedEnrolmentAndDurableCredentialLifecycleRejectsSAsReplacementReadinessWithoutRelyingOnALiveOldRuntime(
  scope: ManagedEnrolmentAndDurableCredentialLifecycleTestScope,
): void {
  it.each([
    'previous boot',
    'heartbeat before activation',
    'delivery before activation',
    'state before activation',
    'wrong image',
    'wrong state boot',
    'not ready',
    'unknown activation',
    'wrong activation target',
  ])('rejects %s as replacement readiness without relying on a live old runtime', async (invalidProof) => {
    await scope.service.enrol(scope.session(), async () => 'OK\n', new AbortController().signal);
    const timestamp = new Date().toISOString();
    await scope.db.getRepository(WagoController).save(
      Object.assign(new WagoController(), {
        id: 1,
        hardwareId: 'cc100-1',
        trustState: 'claimed',
        mqttServerId: 7,
        pairingCodeHash: 'fixture',
        protocolVersion: '1.0.0',
        runtimeVersion: '0.2.0',
        capabilities: '[]',
        lastSeenAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    );
    await scope.db.getRepository(WagoManagedAccess).update(1, { controllerId: 1, state: 'managed' });
    const oldBoot = '00000000-0000-4000-8000-000000000001';
    const newBoot = '00000000-0000-4000-8000-000000000002';
    if (invalidProof === 'previous boot') {
      scope.service['heartbeats'].set(1, {
        imageId: `sha256:${'0'.repeat(64)}`,
        streamId: oldBoot,
        timestamp: Date.now() - 120_000,
        receivedAt: Date.now() - 120_000,
      });
    }
    const host = scope.service['updateHost']();
    const token = 'a'.repeat(32);
    const signal = new AbortController().signal;
    const beforeActivation = Date.now() - 1;
    await host.activate(1, token, scope.artifact, signal);
    const fresh = Date.now() + 1000;
    const imageId = invalidProof === 'wrong activation target' ? `sha256:${'9'.repeat(64)}` : scope.artifact.imageId;
    const streamId = invalidProof === 'previous boot' ? oldBoot : newBoot;
    scope.service['heartbeats'].set(1, {
      imageId: invalidProof === 'wrong image' ? `sha256:${'0'.repeat(64)}` : imageId,
      streamId,
      timestamp: invalidProof === 'heartbeat before activation' ? beforeActivation : fresh,
      receivedAt: invalidProof === 'delivery before activation' ? beforeActivation : fresh,
    });
    const observe = jest.fn(() => ({
      timestamp: invalidProof === 'state before activation' ? beforeActivation : fresh,
      streamId: invalidProof === 'wrong state boot' ? oldBoot : streamId,
      sequence: 1,
      revision: 1,
      contentHash: 'a'.repeat(64),
      connected: true,
      configurationAccepted: true,
      hardwareAvailable: true,
      ready: invalidProof !== 'not ready',
    }));
    scope.service['readiness'].observe = observe;
    clearInterval(scope.service['timer']);
    scope.service['timer'] = undefined;
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    jest.setSystemTime(fresh);
    try {
      const result = expect(
        host.verify(
          1,
          invalidProof === 'unknown activation' ? 'b'.repeat(32) : token,
          imageId,
          beforeActivation - 60_000,
          signal,
        ),
      ).rejects.toMatchObject({ failure: 'readiness' });
      // SQLite completes outside the fake clock. Wait for the first readiness
      // observation before advancing the verification deadline.
      while (!observe.mock.calls.length) {
        await new Promise(setImmediate);
      }
      await jest.advanceTimersByTimeAsync(120_000);
      await result;
    } finally {
      jest.useRealTimers();
    }
  });
}
