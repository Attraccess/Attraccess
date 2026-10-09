import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PluginLiveUpdatesProvider, usePluginLiveUpdates } from '@attraccess/plugins-frontend-sdk';

describe('plugin live topic ownership', () => {
  it('plugin unavailable callbacks follow ownership, abort and unmount guards', () => {
    const failures: Array<() => void> = [];
    const client = {
      subscribe: vi.fn((_subscription, _update, _restore, unavailable: () => void) => {
        failures.push(unavailable);
        return vi.fn();
      }),
    };
    const onUnavailable = vi.fn();
    const hook = renderHook(
      ({ identifier, enabled }) =>
        usePluginLiveUpdates({
          plugin: 'wago',
          topic: 'diagnostics',
          identifier,
          enabled,
          onUpdate: vi.fn(),
          onUnavailable,
        }),
      {
        initialProps: { identifier: '1', enabled: true },
        wrapper: ({ children }) => <PluginLiveUpdatesProvider client={client}>{children}</PluginLiveUpdatesProvider>,
      },
    );
    hook.rerender({ identifier: '2', enabled: true });
    failures[0]();
    expect(onUnavailable).not.toHaveBeenCalled();
    failures[1]();
    expect(onUnavailable).toHaveBeenCalledTimes(1);
    hook.rerender({ identifier: '2', enabled: false });
    failures[1]();
    expect(onUnavailable).toHaveBeenCalledTimes(1);
    hook.rerender({ identifier: '2', enabled: true });
    hook.result.current.abort();
    failures[2]();
    hook.unmount();
    failures[2]();
    expect(onUnavailable).toHaveBeenCalledTimes(1);
  });

  it('late plugin packets cannot update a replacement identifier or an aborted consumer', () => {
    const callbacks: Array<(payload: unknown) => void> = [];
    const client = {
      subscribe: vi.fn((_subscription, callback: (payload: unknown) => void) => {
        callbacks.push(callback);
        return vi.fn();
      }),
    };
    const onUpdate = vi.fn();
    const hook = renderHook(
      ({ identifier }) => usePluginLiveUpdates({ plugin: 'wago', topic: 'diagnostics', identifier, onUpdate }),
      {
        initialProps: { identifier: '1' },
        wrapper: ({ children }) => <PluginLiveUpdatesProvider client={client}>{children}</PluginLiveUpdatesProvider>,
      },
    );
    hook.rerender({ identifier: '2' });
    callbacks[0]({ id: 1 });
    expect(onUpdate).not.toHaveBeenCalled();
    callbacks[1]({ id: 2 });
    expect(onUpdate).toHaveBeenCalledWith({ id: 2 });
    hook.result.current.abort();
    callbacks[1]({ id: 2 });
    expect(onUpdate).toHaveBeenCalledTimes(1);
    hook.unmount();
  });
});
