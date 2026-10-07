import { JsonStateStore, WagoRuntime, hash } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeRequiresFreshServerConfirmationAtStartupAndAfterReconnectRejectingRetainedConfirmations(
  scope: WagoRuntimeTestScope,
): void {
  it('requires fresh server confirmation at startup and after reconnect, rejecting retained confirmations', async () => {
    const imageId = `sha256:${'a'.repeat(64)}`;
    const store = new JsonStateStore(`/tmp/wago-policy-${Date.now()}-${Math.random()}.json`);
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
    expect(await scope.device.read(scope.snapshot.physicalPoints[0])).toBe(false);
    const token = () =>
      (
        scope.transport.published.filter((item) => item.topic.endsWith('/heartbeat')).at(-1)?.payload as {
          runtimePolicyToken: string;
        }
      ).runtimePolicyToken;
    await scope.transport.send(scope.desired, { runtimeImageId: imageId, runtimePolicyToken: 'old-connection' });
    await scope.transport.send(scope.commands, scope.validCommand());
    expect(await scope.device.read(scope.snapshot.physicalPoints[0])).toBe(false);
    const firstToken = token();
    await scope.transport.send(scope.desired, { runtimeImageId: imageId, runtimePolicyToken: firstToken });
    await scope.transport.send(scope.commands, scope.validCommand({ id: 'confirmed' }));
    expect(await scope.device.read(scope.snapshot.physicalPoints[0])).toBe(true);
    await scope.runtime.setConnected(false);
    expect(await scope.device.read(scope.snapshot.physicalPoints[0])).toBe(false);
    await scope.runtime.setConnected(true);
    await new Promise(setImmediate);
    await scope.runtime.publishHeartbeat();
    await scope.transport.send(scope.desired, { runtimeImageId: imageId, runtimePolicyToken: firstToken });
    await scope.transport.send(scope.commands, scope.validCommand({ id: 'stale-policy' }));
    expect(await scope.device.read(scope.snapshot.physicalPoints[0])).toBe(false);
    expect(token()).not.toBe(firstToken);
    await scope.transport.send(scope.desired, { runtimeImageId: imageId, runtimePolicyToken: token() });
    await scope.transport.send(scope.commands, scope.validCommand({ id: 'reconnected' }));
    expect(await scope.device.read(scope.snapshot.physicalPoints[0])).toBe(true);
  });
}
