import type { PreStartContext } from '@attraccess/plugins-backend-sdk';
import { preStartHook, publishHookServices, resolveHookServices, sessionEndHook } from './runtime';

const ctx = { resourceId: 1, userId: 2 } as PreStartContext;

describe('hook runtime', () => {
  afterEach(() => publishHookServices(null));

  it('fails (host failure policy applies) when the module never becomes ready', async () => {
    await expect(resolveHookServices(20)).rejects.toThrow('not ready');
  });

  it('waits for a module that is still booting', async () => {
    const pending = preStartHook(ctx);
    setTimeout(
      () =>
        publishHookServices({
          preStart: { evaluate: async () => ({ decision: 'allow' }) },
          sessionEnd: { evaluate: async () => ({ decision: 'none' }) },
        }),
      10,
    );
    await expect(pending).resolves.toEqual({ decision: 'allow' });
    await expect(sessionEndHook({} as never)).resolves.toEqual({ decision: 'none' });
  });

  it('withdraws the services on shutdown', async () => {
    publishHookServices({
      preStart: { evaluate: async () => ({ decision: 'allow' }) },
      sessionEnd: { evaluate: async () => ({ decision: 'none' }) },
    });
    publishHookServices(null);
    await expect(resolveHookServices(10)).rejects.toThrow();
  });
});
