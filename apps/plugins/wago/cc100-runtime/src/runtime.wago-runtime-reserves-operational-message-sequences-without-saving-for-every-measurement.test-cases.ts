import { JsonStateStore, WagoRuntime } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeReservesOperationalMessageSequencesWithoutSavingForEveryMeasurement(
  scope: WagoRuntimeTestScope,
): void {
  it('reserves operational message sequences without saving for every measurement', async () => {
    const store = new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`);
    scope.runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      store,
      transport: scope.transport,
      device: scope.device,
    });
    await scope.runtime.start();
    const save = jest.spyOn(store, 'save');

    await scope.runtime['publishOperational']('measurements', {
      timestamp: '2026-09-01T00:00:00.000Z',
      channelId: 'meter',
      unit: 'percent',
      value: 42,
    });
    await scope.runtime['publishOperational']('measurements', {
      timestamp: '2026-09-01T00:00:05.000Z',
      channelId: 'meter',
      unit: 'percent',
      value: 43,
    });

    expect(save).not.toHaveBeenCalled();
    expect(scope.transport.published.filter((message) => message.topic.endsWith('/measurements'))).toContainEqual(
      expect.objectContaining({
        payload: expect.objectContaining({ sequence: 1, value: 42 }),
      }),
    );
  });
}
