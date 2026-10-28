import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import {
  PluginLiveUpdatesIdentityProvider,
  PluginLiveUpdatesProvider,
  usePluginLiveUpdates,
  type PluginLiveSubscription,
  type PluginLiveUpdatesClient,
} from './frontend.live-updates';

interface Subscription {
  subscription: PluginLiveSubscription;
  onUpdate: (payload: unknown) => void;
  onReconnect?: () => void;
  onUnavailable?: () => void;
  remove: ReturnType<typeof vi.fn>;
}

function createClient() {
  const subscriptions: Subscription[] = [];
  const client: PluginLiveUpdatesClient = {
    subscribe: (subscription, onUpdate, onReconnect, onUnavailable) => {
      const remove = vi.fn();
      subscriptions.push({ subscription, onUpdate, onReconnect, onUnavailable, remove });
      return remove;
    },
  };
  return { client, subscriptions };
}

type HookProps = Parameters<typeof usePluginLiveUpdates<{ value: number }>>[0];

function renderLiveUpdates(client: PluginLiveUpdatesClient | null, initialProps: HookProps, identity?: string) {
  const wrapper = ({ children }: { children: ReactNode }) => {
    const content = <PluginLiveUpdatesProvider client={client}>{children}</PluginLiveUpdatesProvider>;
    return identity ? (
      <PluginLiveUpdatesIdentityProvider name={identity}>{content}</PluginLiveUpdatesIdentityProvider>
    ) : (
      content
    );
  };
  return renderHook((props: HookProps) => usePluginLiveUpdates(props), { wrapper, initialProps });
}

function hookProps(overrides: Partial<HookProps> = {}): HookProps {
  return { plugin: 'demo plugin', topic: 'status', onUpdate: vi.fn(), ...overrides };
}

describe('usePluginLiveUpdates', () => {
  it('subscribes to the encoded plugin topic and forwards every callback', () => {
    const { client, subscriptions } = createClient();
    const props = hookProps({ identifier: 'device-1', onReconnect: vi.fn(), onUnavailable: vi.fn() });
    renderLiveUpdates(client, props);

    expect(subscriptions).toHaveLength(1);
    const [subscription] = subscriptions;
    expect(subscription.subscription).toEqual({ topic: 'plugin:demo%20plugin:status', identifier: 'device-1' });

    subscription.onUpdate({ value: 1 });
    subscription.onReconnect?.();
    subscription.onUnavailable?.();
    expect(props.onUpdate).toHaveBeenCalledWith({ value: 1 });
    expect(props.onReconnect).toHaveBeenCalledTimes(1);
    expect(props.onUnavailable).toHaveBeenCalledTimes(1);
  });

  it('omits the identifier when none is given and tolerates missing optional callbacks', () => {
    const { client, subscriptions } = createClient();
    renderLiveUpdates(client, hookProps());

    expect(subscriptions[0].subscription).toEqual({ topic: 'plugin:demo%20plugin:status' });
    expect(() => subscriptions[0].onReconnect?.()).not.toThrow();
    expect(() => subscriptions[0].onUnavailable?.()).not.toThrow();
  });

  it('prefers the host-provided manifest name over the plugin prop', () => {
    const { client, subscriptions } = createClient();
    renderLiveUpdates(client, hookProps(), 'manifest-name');

    expect(subscriptions[0].subscription.topic).toBe('plugin:manifest-name:status');
  });

  it('does not subscribe without a client or while disabled', () => {
    expect(() => renderLiveUpdates(null, hookProps())).not.toThrow();

    const { client, subscriptions } = createClient();
    renderLiveUpdates(client, hookProps({ enabled: false }));
    expect(subscriptions).toHaveLength(0);
  });

  it('calls the latest handlers without resubscribing when only callbacks change', () => {
    const { client, subscriptions } = createClient();
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderLiveUpdates(client, hookProps({ onUpdate: first }));

    rerender(hookProps({ onUpdate: second }));
    subscriptions[0].onUpdate({ value: 2 });

    expect(subscriptions).toHaveLength(1);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith({ value: 2 });
  });

  it('ignores late events from a subscription replaced by a topic change', () => {
    const { client, subscriptions } = createClient();
    const props = hookProps({ onReconnect: vi.fn(), onUnavailable: vi.fn() });
    const { rerender } = renderLiveUpdates(client, props);

    rerender({ ...props, topic: 'other' });
    const [stale, current] = subscriptions;
    expect(stale.remove).toHaveBeenCalledTimes(1);
    expect(current.subscription.topic).toBe('plugin:demo%20plugin:other');

    stale.onUpdate({ value: 3 });
    stale.onReconnect?.();
    stale.onUnavailable?.();
    expect(props.onUpdate).not.toHaveBeenCalled();
    expect(props.onReconnect).not.toHaveBeenCalled();
    expect(props.onUnavailable).not.toHaveBeenCalled();

    current.onUpdate({ value: 4 });
    expect(props.onUpdate).toHaveBeenCalledWith({ value: 4 });
  });

  it('aborts the active subscription exactly once and ignores events afterwards', () => {
    const { client, subscriptions } = createClient();
    const props = hookProps();
    const { result, unmount } = renderLiveUpdates(client, props);

    result.current.abort();
    result.current.abort();
    subscriptions[0].onUpdate({ value: 5 });
    unmount();

    expect(subscriptions[0].remove).toHaveBeenCalledTimes(1);
    expect(props.onUpdate).not.toHaveBeenCalled();
  });

  it('unsubscribes on unmount and leaves abort as a no-op', () => {
    const { client, subscriptions } = createClient();
    const { result, unmount } = renderLiveUpdates(client, hookProps());

    unmount();
    expect(subscriptions[0].remove).toHaveBeenCalledTimes(1);
    expect(() => result.current.abort()).not.toThrow();
    expect(subscriptions[0].remove).toHaveBeenCalledTimes(1);
  });
});
