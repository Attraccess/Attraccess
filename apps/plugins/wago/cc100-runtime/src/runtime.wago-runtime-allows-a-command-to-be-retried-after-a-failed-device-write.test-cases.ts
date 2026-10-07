import { JsonStateStore, WagoRuntime, hash } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeAllowsACommandToBeRetriedAfterAFailedDeviceWrite(scope: WagoRuntimeTestScope): void {
  it('allows a command to be retried after a failed device write', async () => {
    let attempts = 0;
    const flakyDevice = {
      write: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('temporary failure');
      },
      read: async () => false,
    };
    scope.runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
      transport: scope.transport,
      device: flakyDevice,
    });
    await scope.runtime.start();
    await scope.transport.send(scope.desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(scope.snapshot),
      snapshot: scope.snapshot,
    });
    await scope.transport.send(scope.commands, scope.validCommand());
    await scope.transport.send(scope.commands, scope.validCommand());

    expect(attempts).toBe(2);
    expect(scope.transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/acknowledgements',
        payload: expect.objectContaining({ id: 'command-1', status: 'accepted', error: undefined }),
      }),
    );
  });
}
