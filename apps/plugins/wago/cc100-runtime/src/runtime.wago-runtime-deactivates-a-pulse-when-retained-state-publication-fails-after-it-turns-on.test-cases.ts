import { JsonStateStore, WagoRuntime, hash, type Transport } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeDeactivatesAPulseWhenRetainedStatePublicationFailsAfterItTurnsOn(
  scope: WagoRuntimeTestScope,
): void {
  it('deactivates a pulse when retained state publication fails after it turns on', async () => {
    const snapshot = scope.pulsedSnapshot;
    let failStatePublication = false;
    const failingTransport: Transport = {
      publish: async (topic, payload, options) => {
        if (failStatePublication && topic.endsWith('/state')) throw new Error('broker unavailable');
        await scope.transport.publish(topic, payload, options);
      },
      subscribe: async (topic, listener) => scope.transport.subscribe(topic, listener),
    };
    scope.runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
      transport: failingTransport,
      device: scope.device,
    });
    await scope.runtime.start();
    await scope.transport.send(scope.desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(snapshot),
      snapshot,
    });
    failStatePublication = true;

    await scope.transport.send(scope.commands, scope.validCommand({ action: 'pulse' }));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(scope.device.values.get('751-9301:0')).toBe(false);
  });
}
