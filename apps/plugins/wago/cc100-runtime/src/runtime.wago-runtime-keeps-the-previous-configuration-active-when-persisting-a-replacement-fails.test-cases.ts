import { JsonStateStore, WagoRuntime, hash } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeKeepsThePreviousConfigurationActiveWhenPersistingAReplacementFails(
  scope: WagoRuntimeTestScope,
): void {
  it('keeps the previous configuration active when persisting a replacement fails', async () => {
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
      contentHash: hash(scope.snapshot),
      snapshot: scope.snapshot,
    });
    const persist = store.save.bind(store);
    jest.spyOn(store, 'save').mockRejectedValueOnce(new Error('disk full')).mockImplementation(persist);

    await scope.transport.send(scope.desired, {
      protocolVersion: 1,
      revision: 2,
      contentHash: hash(scope.snapshot),
      snapshot: scope.snapshot,
    });
    await scope.transport.send(
      scope.commands,
      scope.validCommand({ id: 'revision-one', expectedConfigurationRevision: 1 }),
    );
    await scope.transport.send(
      scope.commands,
      scope.validCommand({ id: 'revision-two', expectedConfigurationRevision: 2 }),
    );

    expect(scope.device.values.get('751-9301:0')).toBe(true);
    expect(scope.transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/acknowledgements',
        payload: expect.objectContaining({ id: 'revision-two', status: 'rejected', code: 'stale_revision' }),
      }),
    );
  });
}
