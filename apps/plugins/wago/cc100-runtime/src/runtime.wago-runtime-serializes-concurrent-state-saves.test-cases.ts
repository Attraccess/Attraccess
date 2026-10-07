import { JsonStateStore } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeSerializesConcurrentStateSaves(scope: WagoRuntimeTestScope): void {
  it('serializes concurrent state saves', async () => {
    const store = new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`);
    await Promise.all([
      store.save({ outputs: { load: false }, commandIds: [] }),
      store.save({ outputs: { load: true }, commandIds: ['command-1'] }),
    ]);

    await expect(store.load()).resolves.toEqual({
      outputs: { load: true },
      commandIds: ['command-1'],
      commandExpiries: {},
    });
  });
}
