import { JsonStateStore, WagoRuntime, hash } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeRejectsPulsesOnSwitchedOutputsBeforeAnyDeviceWriteOrCommandReservation(
  scope: WagoRuntimeTestScope,
): void {
  it('rejects pulses on switched outputs before any device write or command reservation', async () => {
    const store = new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`);
    scope.runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
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
    const write = jest.spyOn(scope.device, 'write');
    await scope.transport.send(scope.commands, scope.validCommand({ action: 'pulse' }));
    expect(write).not.toHaveBeenCalled();
    expect((await store.load())?.commandIds).not.toContain('command-1');
    expect(scope.transport.published).toContainEqual(
      expect.objectContaining({
        payload: expect.objectContaining({ id: 'command-1', status: 'rejected', code: 'unsupported_operation' }),
      }),
    );
  });
}
