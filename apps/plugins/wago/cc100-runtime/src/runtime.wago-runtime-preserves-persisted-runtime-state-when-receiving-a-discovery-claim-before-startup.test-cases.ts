import { JsonStateStore, WagoRuntime, hash } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimePreservesPersistedRuntimeStateWhenReceivingADiscoveryClaimBeforeStartup(
  scope: WagoRuntimeTestScope,
): void {
  it('preserves persisted runtime state when receiving a discovery claim before startup', async () => {
    const store = new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`);
    await store.save({
      accepted: { revision: 3, contentHash: hash(scope.snapshot), snapshot: scope.snapshot },
      outputs: { load: true },
      commandIds: ['command-1'],
    });
    const discoveryRuntime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      enrollmentSecret: 'enrollment-secret',
      store,
      transport: scope.transport,
      device: scope.device,
    });

    await discoveryRuntime.receiveDiscoveryClaim(Buffer.from('{"username":"controller","password":"secret"}'));

    await expect(store.load()).resolves.toEqual({
      accepted: { revision: 3, contentHash: hash(scope.snapshot), snapshot: scope.snapshot },
      outputs: { load: true },
      commandIds: ['command-1'],
      commandExpiries: {},
      credentials: { username: 'controller', password: 'secret' },
    });
  });
}
