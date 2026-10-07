import { hash } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeForcesHoldPolicyOutputsOffAndRejectsWorkWhileTheServerRequiresAnotherImage(
  scope: WagoRuntimeTestScope,
): void {
  it('forces hold-policy outputs off and rejects work while the server requires another image', async () => {
    const held = {
      ...scope.snapshot,
      logicalChannels: [{ ...scope.snapshot.logicalChannels[0], disconnectPolicy: { mode: 'hold' as const } }],
    };
    await scope.transport.send(scope.desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(held),
      snapshot: held,
    });
    await scope.transport.send(scope.commands, scope.validCommand());
    expect(await scope.device.read(scope.snapshot.physicalPoints[0])).toBe(true);
    await scope.transport.send(scope.desired, { runtimeImageId: `sha256:${'b'.repeat(64)}` });
    expect(await scope.device.read(scope.snapshot.physicalPoints[0])).toBe(false);
    await scope.transport.send(scope.commands, scope.validCommand({ id: 'during-update' }));
    expect(await scope.device.read(scope.snapshot.physicalPoints[0])).toBe(false);
    expect(scope.transport.published).toContainEqual(
      expect.objectContaining({
        payload: expect.objectContaining({ id: 'during-update', status: 'rejected', code: 'runtime_update' }),
      }),
    );
    await scope.runtime.publishHeartbeat();
    expect(scope.transport.published.filter((item) => item.topic.endsWith('/state')).at(-1)?.payload).toEqual(
      expect.objectContaining({ readiness: expect.objectContaining({ ready: false, runtimeUpdate: true }) }),
    );
  });
}
