import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import { LiveSubscription } from '@attraccess/shared';
import { getBaseUrl } from '../api';
import { UseUsersServiceGetCurrentKeyFn } from '@attraccess/react-query-client';
import { LivePayloads } from './live-update-types';
import { LiveUpdateClient } from './live-update-client';
import { PluginLiveUpdatesProvider } from '@attraccess/plugins-frontend-sdk';

const Context = createContext<LiveUpdateClient | null>(null);
const clients = new Set<LiveUpdateClient>();
const useLiveUpdatesAuth = create(() => ({ stopped: false, generation: 0 }));

function disposeClients(): void {
  clients.forEach((client) => client.dispose());
  clients.clear();
}

/** A successful explicit login starts a new authentication context. */
export function resumeLiveUpdates(): void {
  disposeClients();
  useLiveUpdatesAuth.setState((state) => ({ stopped: false, generation: state.generation + 1 }));
}

/** Called before logout, so callbacks stop even while the logout request is pending. */
export function stopLiveUpdates(): void {
  disposeClients();
  useLiveUpdatesAuth.setState({ stopped: true });
}

export function LiveUpdatesProvider({ userId, children }: { userId?: number; children: ReactNode }) {
  const queryClient = useQueryClient();
  const origin = getBaseUrl();
  const { stopped: isStopped, generation } = useLiveUpdatesAuth();
  const client = useMemo(
    () =>
      userId && !isStopped
        ? new LiveUpdateClient(
            origin,
            () => {
              if (useLiveUpdatesAuth.getState().generation !== generation) return;
              stopLiveUpdates();
              queryClient.setQueryData(UseUsersServiceGetCurrentKeyFn(), null);
              queryClient.clear();
            },
            () => {
              if (useLiveUpdatesAuth.getState().generation !== generation) return;
              // The host owns query recovery once per connection, including plugins.
              void queryClient.invalidateQueries();
            },
          )
        : null,
    [userId, origin, queryClient, isStopped, generation],
  );
  useEffect(() => {
    if (!client) return;
    clients.add(client);
    return () => {
      clients.delete(client);
      // React StrictMode immediately sets up the same owner again.
      queueMicrotask(() => {
        if (!clients.has(client)) client.dispose();
      });
    };
  }, [client]);
  return (
    <Context.Provider value={client}>
      <PluginLiveUpdatesProvider client={client}>{children}</PluginLiveUpdatesProvider>
    </Context.Provider>
  );
}

type CoreLiveTopic = keyof LivePayloads;
type TopicSubscription<T extends CoreLiveTopic> = T extends 'resource' | 'flow-logs'
  ? { topic: T; resourceId: number }
  : { topic: T; resourceId?: never };

export function useLiveUpdates<T extends CoreLiveTopic>(
  props: { topic: T } & TopicSubscription<T> & {
      onUpdate: (payload: LivePayloads[T]) => void;
      onReconnect?: () => void;
      onUnavailable?: () => void;
      enabled?: boolean;
    },
) {
  const client = useContext(Context);
  const queryClient = useQueryClient();
  const { topic, resourceId, enabled = true } = props;
  const latest = useRef({ props, client });
  latest.current = { props, client };
  const unsubscribeRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!enabled || !client) return;
    let active = true;
    const matches = () =>
      active &&
      latest.current.client === client &&
      latest.current.props.enabled !== false &&
      latest.current.props.topic === topic &&
      latest.current.props.resourceId === resourceId;
    const subscription = { topic, ...(resourceId !== undefined ? { resourceId } : {}) } as LiveSubscription;
    const unsubscribe = client.subscribe(
      subscription,
      (payload) => {
        if (matches()) return latest.current.props.onUpdate(payload as LivePayloads[T]);
      },
      () => {
        if (matches()) return latest.current.props.onReconnect?.();
      },
      () => {
        if (matches()) return latest.current.props.onUnavailable?.();
      },
    );
    const cleanup = () => {
      if (!active) return;
      active = false;
      unsubscribe();
    };
    unsubscribeRef.current = cleanup;
    return () => {
      cleanup();
      if (unsubscribeRef.current === cleanup) unsubscribeRef.current = null;
    };
  }, [client, topic, resourceId, enabled, queryClient]);
  // Feature state can use this identity to reset on authentication-context changes.
  return { abort: useCallback(() => unsubscribeRef.current?.(), []), owner: client };
}
