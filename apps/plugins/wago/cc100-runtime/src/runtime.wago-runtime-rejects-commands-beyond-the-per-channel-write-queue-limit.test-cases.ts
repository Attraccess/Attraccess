import { MAX_PENDING_CHANNEL_WRITES, JsonStateStore, WagoRuntime, hash } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeRejectsCommandsBeyondThePerChannelWriteQueueLimit(
  scope: WagoRuntimeTestScope,
): void {
  it('rejects commands beyond the per-channel write queue limit', async () => {
    let releaseFirstWrite!: () => void;
    let firstWriteStarted!: () => void;
    const firstWrite = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve;
    });
    const started = new Promise<void>((resolve) => {
      firstWriteStarted = resolve;
    });
    const slowDevice = {
      write: async () => {
        firstWriteStarted();
        await firstWrite;
      },
      read: async () => false,
    };
    scope.runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
      transport: scope.transport,
      device: slowDevice,
    });
    await scope.runtime.start();
    await scope.transport.send(scope.desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(scope.snapshot),
      snapshot: scope.snapshot,
    });

    const commandsInFlight = Array.from({ length: MAX_PENDING_CHANNEL_WRITES + 1 }, (_, index) =>
      scope.transport.send(
        scope.commands,
        scope.validCommand({ id: `command-${index}`, channelId: 'load', action: 'set', value: true }),
      ),
    );
    await started;
    await commandsInFlight[MAX_PENDING_CHANNEL_WRITES];
    expect(scope.transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/acknowledgements',
        payload: expect.objectContaining({
          id: `command-${MAX_PENDING_CHANNEL_WRITES}`,
          status: 'rejected',
          error: 'channel write queue is full',
        }),
      }),
    );

    releaseFirstWrite();
    await Promise.all(commandsInFlight);
  });
}
