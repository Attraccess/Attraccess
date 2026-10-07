import { JsonStateStore, WagoRuntime, hash } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeAllowsACommandIdToBeReusedAfterItsPersistedExpiry(
  scope: WagoRuntimeTestScope,
): void {
  it('allows a command ID to be reused after its persisted expiry', async () => {
    const store = new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`);
    await store.save({
      accepted: { revision: 1, contentHash: hash(scope.snapshot), snapshot: scope.snapshot },
      outputs: {},
      commandIds: ['expired-command'],
      commandExpiries: { 'expired-command': '2000-01-01T00:00:00.000Z' },
    });
    scope.runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      store,
      transport: scope.transport,
      device: scope.device,
    });
    await scope.runtime.start();

    await scope.transport.send(scope.commands, scope.validCommand({ id: 'expired-command' }));

    expect(scope.device.values.get('751-9301:0')).toBe(true);
    expect(scope.transport.published).toContainEqual(
      expect.objectContaining({ payload: expect.objectContaining({ id: 'expired-command', status: 'accepted' }) }),
    );
  });
}
