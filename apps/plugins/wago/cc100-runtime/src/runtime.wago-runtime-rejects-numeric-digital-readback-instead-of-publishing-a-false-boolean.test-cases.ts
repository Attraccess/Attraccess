import { JsonStateStore, WagoRuntime, hash } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeRejectsNumericDigitalReadbackInsteadOfPublishingAFalseBoolean(
  scope: WagoRuntimeTestScope,
): void {
  it('rejects numeric digital readback instead of publishing a false boolean', async () => {
    const numericFeedbackDevice = {
      write: async () => undefined,
      read: async () => 1,
    };
    scope.runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
      transport: scope.transport,
      device: numericFeedbackDevice,
    });
    await scope.runtime.start();
    await scope.transport.send(scope.desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(scope.snapshot),
      snapshot: scope.snapshot,
    });
    await scope.transport.send(
      scope.commands,
      scope.validCommand({ id: 'command-1', channelId: 'load', action: 'set', value: true }),
    );

    expect(scope.transport.published.filter((message) => message.topic.endsWith('/state')).at(-1)).toEqual(
      expect.objectContaining({
        payload: expect.objectContaining({
          outputs: {},
          readiness: expect.objectContaining({ hardwareAvailable: false }),
        }),
      }),
    );
  });
}
