import { registerTestReaderUi } from './reader-ui-test-hooks.test-fixture';

describe('registerTestReaderUi', () => {
  it('registers a live scenario with the registry and unregisters it again', async () => {
    const entries = new Map<string, { preStartHook?: (ctx: never) => unknown }>();
    const registry = {
      register: (name: string, entry: { preStartHook?: (ctx: never) => unknown }) => entries.set(name, entry),
      unregister: (name: string) => entries.delete(name),
    };
    const app = { get: () => registry };
    let decision: 'allow' | 'block' = 'allow';
    const { unregister } = registerTestReaderUi(app as never, {
      preStartHook: () =>
        decision === 'allow'
          ? { decision: 'allow' }
          : { decision: 'block', reason: { code: 'X', title: 't', body: 'b' } },
    });
    const hook = entries.get('test-hooks')?.preStartHook as (ctx: never) => unknown;
    expect(await hook({} as never)).toEqual({ decision: 'allow' });
    decision = 'block';
    expect(await hook({} as never)).toMatchObject({ decision: 'block' });
    unregister();
    expect(entries.has('test-hooks')).toBe(false);
  });
});
