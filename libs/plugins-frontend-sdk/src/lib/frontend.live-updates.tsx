import { createContext, useCallback, useContext, useEffect, useRef, type Context, type ReactNode } from 'react';

export interface PluginLiveSubscription {
  topic: `plugin:${string}:${string}`;
  identifier?: string;
}

export interface PluginLiveUpdatesClient {
  subscribe(
    subscription: PluginLiveSubscription,
    onUpdate: (payload: unknown) => void,
    onReconnect?: () => void,
  ): () => void;
}

// SDK copies are bundled independently by federation remotes. Share the context
// object across those copies, while the host provider owns the authenticated client.
const contextKey = Symbol.for('attraccess.plugin.live-updates.context');
const contexts = globalThis as typeof globalThis & { [contextKey]?: Context<PluginLiveUpdatesClient | null> };
const LiveContext = (contexts[contextKey] ??= createContext<PluginLiveUpdatesClient | null>(null));

/** Host integration only. No plugin opens its own transport. */
export function PluginLiveUpdatesProvider({
  client,
  children,
}: {
  client: PluginLiveUpdatesClient | null;
  children: ReactNode;
}) {
  return <LiveContext.Provider value={client}>{children}</LiveContext.Provider>;
}

export function usePluginLiveUpdates<T>(props: {
  plugin: string;
  topic: string;
  identifier?: string;
  enabled?: boolean;
  onUpdate: (payload: T) => void;
  onReconnect?: () => void;
}) {
  const client = useContext(LiveContext);
  const latest = useRef({ props, client });
  latest.current = { props, client };
  const unsubscribe = useRef<(() => void) | null>(null);
  const { plugin, topic, identifier, enabled = true } = props;
  useEffect(() => {
    if (!client || !enabled) return;
    let active = true;
    const matches = () =>
      active &&
      latest.current.client === client &&
      latest.current.props.enabled !== false &&
      latest.current.props.plugin === plugin &&
      latest.current.props.topic === topic &&
      latest.current.props.identifier === identifier;
    const remove = client.subscribe(
      { topic: `plugin:${encodeURIComponent(plugin)}:${topic}`, ...(identifier !== undefined ? { identifier } : {}) },
      (payload) => {
        if (matches()) return latest.current.props.onUpdate(payload as T);
      },
      () => {
        if (matches()) return latest.current.props.onReconnect?.();
      },
    );
    const cleanup = () => {
      if (!active) return;
      active = false;
      remove();
    };
    unsubscribe.current = cleanup;
    return () => {
      cleanup();
      if (unsubscribe.current === cleanup) unsubscribe.current = null;
    };
  }, [client, plugin, topic, identifier, enabled]);
  return { abort: useCallback(() => unsubscribe.current?.(), []) };
}
