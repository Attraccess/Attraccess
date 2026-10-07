import { WagoRuntime } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeRetriesInterruptedStartupWithoutReloadingStateOrDuplicatingEstablishedSubscriptions(
  scope: WagoRuntimeTestScope,
): void {
  it('retries interrupted startup without reloading state or duplicating established subscriptions', async () => {
    const subscribe = jest.spyOn(scope.transport, 'subscribe');
    subscribe.mockImplementationOnce(async (topic, listener) => {
      scope.transport.listeners.set(topic, listener);
    });
    subscribe.mockRejectedValueOnce(new Error('MQTT subscribe acknowledgment timed out'));
    const load = jest.fn(async () => ({ outputs: {}, commandIds: [] }));
    scope.runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      store: { load, save: async () => undefined },
      transport: scope.transport,
      device: scope.device,
    });
    await expect(scope.runtime.start()).rejects.toThrow('timed out');
    await scope.runtime.start();
    expect(load).toHaveBeenCalledTimes(1);
    expect(subscribe.mock.calls.map(([topic]) => topic)).toEqual([scope.desired, scope.commands, scope.commands]);
  });
}
