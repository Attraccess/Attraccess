import { JsonStateStore, WagoRuntime, hash } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeDoesNotAcknowledgeAPulseWhenPersistingItsOutputStateFails(
  scope: WagoRuntimeTestScope,
): void {
  it('does not acknowledge a pulse when persisting its output state fails', async () => {
    const snapshot = scope.pulsedSnapshot;
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
      contentHash: hash(snapshot),
      snapshot,
    });
    const persist = store.save.bind(store);
    const save = jest.spyOn(store, 'save');
    save.mockImplementationOnce(persist).mockImplementationOnce(persist).mockRejectedValueOnce(new Error('disk full'));

    await expect(scope.transport.send(scope.commands, scope.validCommand({ action: 'pulse' }))).rejects.toThrow(
      'failed to persist channel state',
    );

    expect(scope.device.values.get('751-9301:0')).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(scope.device.values.get('751-9301:0')).toBe(false);
    expect(scope.transport.published).not.toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/acknowledgements',
        payload: expect.objectContaining({ id: 'command-1', status: 'accepted' }),
      }),
    );
  });
}
