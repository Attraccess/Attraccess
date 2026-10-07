import { JsonStateStore, WagoRuntime, hash } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeActivatesDisconnectHandlingBeforeAStalledInitialCanonicalHeartbeat(
  scope: WagoRuntimeTestScope,
): void {
  it('activates disconnect handling before a stalled initial canonical heartbeat', async () => {
    const store = new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`);
    await store.save({
      accepted: { revision: 1, contentHash: hash(scope.snapshot), snapshot: scope.snapshot },
      outputs: { load: true },
      commandIds: [],
    });
    scope.device.values.set('751-9301:0', true);
    let activated!: () => void;
    const ready = new Promise<void>((resolve) => {
      activated = resolve;
    });
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const publish = scope.transport.publish.bind(scope.transport);
    jest.spyOn(scope.transport, 'publish').mockImplementation(async (topic, payload, options) => {
      await publish(topic, payload, options);
      if (topic.endsWith('/heartbeat')) await held;
    });
    scope.runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      store,
      transport: scope.transport,
      device: scope.device,
    });
    const starting = scope.runtime.start(async () => {
      activated();
    });
    await ready;
    await scope.runtime.setConnected(false);
    expect(scope.device.values.get('751-9301:0')).toBe(false);
    expect(scope.transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/heartbeat',
        payload: expect.objectContaining({ timestamp: expect.any(String), streamId: expect.any(String), sequence: 1 }),
      }),
    );
    release();
    await starting;
  });
}
