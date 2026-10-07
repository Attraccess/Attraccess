import { JsonStateStore, WagoRuntime, hash, type Snapshot } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeRetriesTheAggregateImmediateShutdownStateAfterAStateStoreFailure(
  scope: WagoRuntimeTestScope,
): void {
  it('retries the aggregate immediate shutdown state after a state-store failure', async () => {
    const twoOutputs: Snapshot = {
      ...scope.snapshot,
      physicalPoints: [...scope.snapshot.physicalPoints, { id: 'output-2', hardwareProfile: '751-9301', channel: 1 }],
      logicalChannels: [
        ...scope.snapshot.logicalChannels,
        {
          ...scope.snapshot.logicalChannels[0],
          id: 'load-2',
          physicalPointId: 'output-2',
        },
      ],
    };
    const store = new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`);
    scope.runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      store,
      transport: scope.transport,
      device: scope.device,
    });
    await scope.runtime.start();
    await scope.transport.send(scope.desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(twoOutputs),
      snapshot: twoOutputs,
    });
    await scope.transport.send(scope.commands, scope.validCommand());
    await scope.transport.send(scope.commands, scope.validCommand({ id: 'command-2', channelId: 'load-2' }));
    const persist = store.save.bind(store);
    jest.spyOn(store, 'save').mockImplementationOnce(persist).mockRejectedValueOnce(new Error('disk full'));

    await expect(scope.runtime.setConnected(false)).resolves.toBeUndefined();

    expect(scope.device.values.get('751-9301:0')).toBe(false);
    expect(scope.device.values.get('751-9301:1')).toBe(false);
    await expect(store.load()).resolves.toEqual(expect.objectContaining({ outputs: { load: false, 'load-2': false } }));
  });
}
