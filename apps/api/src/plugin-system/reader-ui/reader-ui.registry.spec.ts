import { ReaderUiRegistry } from './reader-ui.registry';

function setup() {
  const alerts = {
    raise: jest.fn().mockResolvedValue({}),
    clearWhere: jest.fn().mockResolvedValue(undefined),
  };
  const events = { emit: jest.fn() };
  const registry = new ReaderUiRegistry(events as never, alerts as never);
  return { registry, alerts, events };
}

describe('ReaderUiRegistry', () => {
  it('raises a load-failure alert when a plugin with ACCESS_HOOKS fails to load', async () => {
    const { registry, alerts } = setup();
    registry.reportLoadFailure('@scope/reservations', true, new Error('boom'));
    expect(alerts.raise).toHaveBeenCalledWith('load-failure', expect.stringContaining('@scope/reservations'), {
      plugin: '@scope/reservations',
    });
  });

  it('raises nothing for a failing plugin without access hooks', () => {
    const { registry, alerts } = setup();
    registry.reportLoadFailure('widgets', false, new Error('boom'));
    expect(alerts.raise).not.toHaveBeenCalled();
  });

  it('survives an alert store failure', async () => {
    const { registry, alerts } = setup();
    alerts.raise.mockRejectedValue(new Error('db down'));
    expect(() => registry.reportLoadFailure('p', true, new Error('boom'))).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));
  });

  it('clears the load-failure alert once the plugin registers, and lists hooks in host order', () => {
    const { registry, alerts } = setup();
    const hook = () => ({ decision: 'allow' as const });
    registry.register('b', { preStartHook: hook });
    registry.register('a', { preStartHook: hook, sessionEndHook: () => ({ decision: 'none' as const }) });
    expect(alerts.clearWhere).toHaveBeenCalledWith('load-failure', { plugin: 'a' });
    expect(registry.preStartHooks().map((entry) => entry.plugin)).toEqual(['a', 'b']);
    expect(registry.sessionEndHooks().map((entry) => entry.plugin)).toEqual(['a']);
    registry.unregister('a');
    expect(registry.pluginNames()).toEqual(['b']);
  });
});
