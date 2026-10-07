import { JsonStateStore, WagoRuntime, hash } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimePersistsACommandReservationBeforeActuatingTheDevice(
  scope: WagoRuntimeTestScope,
): void {
  it('persists a command reservation before actuating the device', async () => {
    const store = new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`);
    const reservingDevice = {
      write: async () => {
        expect((await store.load()).commandIds).toContain('command-1');
      },
      read: async () => false,
    };
    scope.runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      store,
      transport: scope.transport,
      device: reservingDevice,
    });
    await scope.runtime.start();
    await scope.transport.send(scope.desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(scope.snapshot),
      snapshot: scope.snapshot,
    });

    await scope.transport.send(scope.commands, scope.validCommand());

    await expect(store.load()).resolves.toEqual(expect.objectContaining({ commandIds: ['command-1'] }));
  });
}
