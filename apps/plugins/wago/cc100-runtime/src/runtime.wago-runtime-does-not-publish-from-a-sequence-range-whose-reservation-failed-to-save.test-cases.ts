import { JsonStateStore, WagoRuntime } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeDoesNotPublishFromASequenceRangeWhoseReservationFailedToSave(
  scope: WagoRuntimeTestScope,
): void {
  it('does not publish from a sequence range whose reservation failed to save', async () => {
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
    const persist = store.save.bind(store);
    const save = jest.spyOn(store, 'save').mockRejectedValueOnce(new Error('disk full')).mockImplementation(persist);

    await expect(
      scope.runtime['publishOperational']('measurements', {
        timestamp: '2026-09-01T00:00:00.000Z',
        channelId: 'meter',
        unit: 'percent',
        value: 42,
      }),
    ).rejects.toThrow('disk full');
    expect(scope.runtime['reservedSequence']).toBe(100);
    expect(scope.runtime['state'].sequence).toBe(100);

    await scope.runtime['publishOperational']('measurements', {
      timestamp: '2026-09-01T00:00:05.000Z',
      channelId: 'meter',
      unit: 'percent',
      value: 43,
    });

    expect(save).toHaveBeenCalledTimes(2);
    expect(scope.transport.published.filter((message) => message.topic.endsWith('/measurements'))).toContainEqual(
      expect.objectContaining({
        payload: expect.objectContaining({ sequence: 101, value: 43 }),
      }),
    );
  });
}
