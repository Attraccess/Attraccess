import { cleanup, render } from '@testing-library/react';
import {
  AttraccessFrontendPlugin,
  PluginLiveUpdatesIdentityProvider,
  PluginLiveUpdatesProvider,
  RESOURCE_OVERVIEW_SLOT,
  usePluginLiveUpdates,
} from '@attraccess/plugins-frontend-sdk';
import { afterEach, expect, it, vi } from 'vitest';
import { getRoutesOfPlugin } from '../routes/index';
import { PluginSlot } from './PluginSlot';
import usePluginState, { PluginManifestWithPlugin } from './plugin.state';

afterEach(() => {
  cleanup();
  usePluginState.setState({ plugins: [] });
});

function Status() {
  usePluginLiveUpdates({ plugin: 'wago', topic: 'controllers', onUpdate: () => undefined });
  return null;
}

it.each(['wago', '@attraccess/plugin-wago'])('routes and slots subscribe using loaded identity %s', (name) => {
  const remove = vi.fn();
  const client = { subscribe: vi.fn((_subscription: unknown) => remove) };
  const plugin = {
    getPluginName: () => 'wago-plugin@0.1.0',
    getRoutes: () => [{ path: '/wago', authRequired: 'resources.update', element: <Status /> }],
    getSlotContributions: () => [{ slotId: RESOURCE_OVERVIEW_SLOT, render: () => <Status /> }],
  } as unknown as AttraccessFrontendPlugin;
  const manifest = { name, plugin } as PluginManifestWithPlugin;
  usePluginState.setState({ plugins: [manifest] });
  const { unmount } = render(
    <PluginLiveUpdatesProvider client={client}>
      {getRoutesOfPlugin(manifest)[0].element}
      <PluginSlot slotId={RESOURCE_OVERVIEW_SLOT} />
    </PluginLiveUpdatesProvider>,
  );
  expect(client.subscribe).toHaveBeenCalledTimes(2);
  for (const call of client.subscribe.mock.calls) {
    expect(call[0]).toEqual({ topic: `plugin:${encodeURIComponent(name)}:controllers` });
  }
  unmount();
  expect(remove).toHaveBeenCalledTimes(2);
});

it('identity replacement releases the former subscription and ignores its late callbacks', () => {
  const callbacks: Array<() => void> = [];
  const remove = vi.fn();
  const client = {
    subscribe: vi.fn((_subscription, update) => {
      callbacks.push(update);
      return remove;
    }),
  };
  const update = vi.fn();
  function Consumer() {
    usePluginLiveUpdates({ plugin: 'wago', topic: 'controllers', onUpdate: update });
    return null;
  }
  const view = render(
    <PluginLiveUpdatesProvider client={client}>
      <PluginLiveUpdatesIdentityProvider name="wago">
        <Consumer />
      </PluginLiveUpdatesIdentityProvider>
    </PluginLiveUpdatesProvider>,
  );
  view.rerender(
    <PluginLiveUpdatesProvider client={client}>
      <PluginLiveUpdatesIdentityProvider name="@attraccess/plugin-wago">
        <Consumer />
      </PluginLiveUpdatesIdentityProvider>
    </PluginLiveUpdatesProvider>,
  );
  callbacks[0]();
  expect(update).not.toHaveBeenCalled();
  callbacks[1]();
  expect(update).toHaveBeenCalledTimes(1);
  expect(remove).toHaveBeenCalledTimes(1);
  view.unmount();
  expect(remove).toHaveBeenCalledTimes(2);
});
