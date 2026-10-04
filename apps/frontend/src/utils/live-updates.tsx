import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { LiveSubscription } from '@attraccess/shared';
import { getBaseUrl } from '../api';
import { UseUsersServiceGetCurrentKeyFn } from '@attraccess/react-query-client';
import { LivePayloads } from './live-update-types';
import { LiveUpdateClient } from './live-update-client';
import { PluginLiveUpdatesProvider } from '@attraccess/plugins-frontend-sdk';

const Context = createContext<LiveUpdateClient | null>(null);
const clients = new Set<LiveUpdateClient>();
const authListeners = new Set<() => void>();
let stopped = false;
const subscribeAuth = (listener: () => void) => {
  authListeners.add(listener);
  return () => {
    authListeners.delete(listener);
  };
};

/** A successful explicit login starts a new authentication context. */
export function resumeLiveUpdates(): void {
  stopped = false;
  authListeners.forEach((listener) => listener());
}

/** Called before logout, so callbacks stop even while the logout request is pending. */
export function stopLiveUpdates(): void {
  stopped = true;
  clients.forEach((client) => client.dispose());
  clients.clear();
  authListeners.forEach((listener) => listener());
}

export function LiveUpdatesProvider({ userId, children }: { userId?: number; children: ReactNode }) {
  const queryClient = useQueryClient();
  const origin = getBaseUrl();
  const isStopped = useSyncExternalStore(subscribeAuth, () => stopped);
  const client = useMemo(
    () =>
      userId && !isStopped
        ? new LiveUpdateClient(
            origin,
            () => {
              stopLiveUpdates();
              queryClient.setQueryData(UseUsersServiceGetCurrentKeyFn(), null);
              queryClient.clear();
            },
            () => {
              void queryClient.invalidateQueries();
            },
          )
        : null,
    [userId, origin, queryClient, isStopped],
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
      enabled?: boolean;
    },
) {
  const client = useContext(Context);
  const queryClient = useQueryClient();
  const { topic, resourceId, enabled = true } = props;
  const propsRef = useRef(props);
  propsRef.current = props;
  const unsubscribeRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!enabled || !client) return;
    const subscription = { topic, ...(resourceId !== undefined ? { resourceId } : {}) } as LiveSubscription;
    const unsubscribe = client.subscribe(
      subscription,
      (payload) => propsRef.current.onUpdate(payload as LivePayloads[T]),
      () => {
        propsRef.current.onReconnect?.();
      },
    );
    unsubscribeRef.current = unsubscribe;
    return () => {
      unsubscribe();
      if (unsubscribeRef.current === unsubscribe) unsubscribeRef.current = null;
    };
  }, [client, topic, resourceId, enabled, queryClient]);
  return { abort: useCallback(() => unsubscribeRef.current?.(), []) };
}
