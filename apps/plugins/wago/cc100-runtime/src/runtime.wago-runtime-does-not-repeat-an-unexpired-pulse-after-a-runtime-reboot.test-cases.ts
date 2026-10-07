import { JsonStateStore, WagoRuntime, hash } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeDoesNotRepeatAnUnexpiredPulseAfterARuntimeReboot(scope: WagoRuntimeTestScope): void {
  it('does not repeat an unexpired pulse after a runtime reboot', async () => {
    const snapshot = scope.pulsedSnapshot;
    const store = new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`);
    scope.runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      store,
      transport: scope.transport,
      device: scope.device,
    });
    await scope.runtime.start();
    await scope.transport.send(scope.desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(snapshot),
      snapshot,
    });
    await scope.transport.send(
      scope.commands,
      scope.validCommand({
        id: 'durable-pulse',
        expiresAt: '2099-01-01T00:00:00.000Z',
        channelId: 'load',
        action: 'pulse',
        expectedConfigurationRevision: 1,
      }),
    );
    scope.runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      store,
      transport: scope.transport,
      device: scope.device,
    });
    await scope.runtime.start();
    await scope.transport.send(scope.desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(snapshot),
      snapshot,
    });
    await scope.transport.send(
      scope.commands,
      scope.validCommand({
        id: 'durable-pulse',
        expiresAt: '2099-01-01T00:00:00.000Z',
        channelId: 'load',
        action: 'pulse',
        expectedConfigurationRevision: 1,
      }),
    );

    expect(
      scope.transport.published.filter(
        (message) =>
          message.payload &&
          typeof message.payload === 'object' &&
          (message.payload as { id?: string }).id === 'durable-pulse',
      ),
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ payload: expect.objectContaining({ status: 'duplicate' }) })]),
    );
  });
}
