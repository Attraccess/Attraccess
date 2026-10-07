import { JsonStateStore, WagoRuntime } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeDoesNotLetAConcurrentStateSaveOverwriteASequenceReservation(
  scope: WagoRuntimeTestScope,
): void {
  it('does not let a concurrent state save overwrite a sequence reservation', async () => {
    const store = new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`);
    scope.runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      store,
      transport: scope.transport,
      device: scope.device,
    });
    await scope.runtime.start();
    scope.runtime['sequence'] = 100;
    scope.runtime['categorySequences'].set('measurements', 100);
    scope.runtime['reservedSequence'] = 100;
    scope.runtime['state'].sequence = 100;

    const publish = scope.runtime['publishOperational']('measurements', {
      timestamp: '2026-09-01T00:00:00.000Z',
      channelId: 'meter',
      unit: 'percent',
      value: 42,
    });
    const saveClaim = scope.runtime.receiveClaim({ username: 'controller', password: 'secret' });
    await Promise.all([publish, saveClaim]);

    await expect(store.load()).resolves.toEqual(
      expect.objectContaining({
        credentials: { username: 'controller', password: 'secret' },
        sequence: 200,
      }),
    );
  });
}
