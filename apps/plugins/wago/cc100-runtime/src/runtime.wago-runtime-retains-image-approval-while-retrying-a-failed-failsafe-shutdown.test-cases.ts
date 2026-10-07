import { JsonStateStore, WagoRuntime, hash } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeRetainsImageApprovalWhileRetryingAFailedFailsafeShutdown(
  scope: WagoRuntimeTestScope,
): void {
  it('retains image approval while retrying a failed failsafe shutdown', async () => {
    const imageId = `sha256:${'a'.repeat(64)}`;
    const store = new JsonStateStore(`/tmp/wago-policy-retry-${Date.now()}-${Math.random()}.json`);
    const held = {
      ...scope.snapshot,
      logicalChannels: [{ ...scope.snapshot.logicalChannels[0], disconnectPolicy: { mode: 'hold' as const } }],
    };
    await store.save({
      accepted: { revision: 1, contentHash: hash(held), snapshot: held },
      outputs: { load: true },
      commandIds: [],
    });
    await scope.device.write(scope.snapshot.physicalPoints[0], true);
    const write = scope.device.write.bind(scope.device);
    let shutdownAvailable = false;
    jest.spyOn(scope.device, 'write').mockImplementation(async (point, value) => {
      if (!value && !shutdownAvailable) throw new Error('shutdown unavailable');
      await write(point, value);
    });
    scope.runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      runtimeImageId: imageId,
      store,
      transport: scope.transport,
      device: scope.device,
    });
    await scope.runtime.start();
    const heartbeat = scope.transport.published.filter((item) => item.topic.endsWith('/heartbeat')).at(-1)?.payload as {
      runtimePolicyToken: string;
    };
    await scope.transport.send(scope.desired, {
      runtimeImageId: imageId,
      runtimePolicyToken: heartbeat.runtimePolicyToken,
    });
    await scope.transport.send(scope.commands, scope.validCommand({ id: 'shutdown-pending' }));
    expect(scope.transport.published).toContainEqual(
      expect.objectContaining({ payload: expect.objectContaining({ id: 'shutdown-pending', code: 'runtime_update' }) }),
    );
    shutdownAvailable = true;
    await scope.runtime.publishHeartbeat();
    expect(await scope.device.read(scope.snapshot.physicalPoints[0])).toBe(false);
    expect(scope.transport.published.filter((item) => item.topic.endsWith('/state')).at(-1)?.payload).toEqual(
      expect.objectContaining({ readiness: expect.objectContaining({ ready: true }) }),
    );
    await scope.transport.send(scope.commands, scope.validCommand({ id: 'shutdown-recovered' }));
    expect(await scope.device.read(scope.snapshot.physicalPoints[0])).toBe(true);
  });
}
