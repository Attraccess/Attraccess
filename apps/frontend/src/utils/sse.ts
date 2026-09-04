import { useCallback, useRef, useEffect } from 'react';
import { getBaseUrl } from '../api';
import { events } from 'fetch-event-stream';

interface Props<TPacket> {
  path: string;
  onUpdate: (data: TPacket) => void;
  enabled?: boolean;
}

type Subscriber = (data: unknown) => void;

interface SseConnection {
  abortController: AbortController;
  subscribers: Set<Subscriber>;
}

const connections = new Map<string, SseConnection>();

async function consume(url: string, connection: SseConnection) {
  try {
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      signal: connection.abortController.signal,
    });

    if (!res.ok) {
      // A 401 is expected while a previously authenticated app is logging out.
      if (res.status === 401) {
        return;
      }
      throw new Error(`Failed to connect to SSE: ${res.status} ${res.statusText}`);
    }

    for await (const event of events(res, connection.abortController.signal)) {
      try {
        const nextPacket = JSON.parse(event.data as string);

        if (nextPacket.keepalive) {
          continue;
        }

        connection.subscribers.forEach((subscriber) => subscriber(nextPacket));
      } catch (parseError) {
        console.error('[FlowContext] Error parsing event data:', parseError, event);
      }
    }
  } catch (error) {
    // Abort errors are expected when the last subscriber unmounts.
    if (error instanceof Error && error.name !== 'AbortError' && !error.message.includes('401')) {
      console.error('[SSE] Connection error:', error);
    }
  } finally {
    if (connection.subscribers.size === 0 && connections.get(url) === connection) {
      connections.delete(url);
    }
  }
}

function subscribe(url: string, subscriber: Subscriber): () => void {
  let connection = connections.get(url);

  if (!connection) {
    connection = {
      abortController: new AbortController(),
      subscribers: new Set(),
    };
    connections.set(url, connection);
    void consume(url, connection);
  }

  connection.subscribers.add(subscriber);

  return () => {
    connection.subscribers.delete(subscriber);

    if (connection.subscribers.size === 0 && connections.get(url) === connection) {
      connections.delete(url);
      connection.abortController.abort();
    }
  };
}

export function useSSE<TPacket>(props: Props<TPacket>) {
  const { path, onUpdate, enabled = true } = props;

  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Use a ref so onUpdate changes don't force reconnects
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const unsubscribe = subscribe(`${getBaseUrl()}${path}`, (data) => onUpdateRef.current(data as TPacket));
    unsubscribeRef.current = unsubscribe;

    return () => {
      unsubscribe();
      if (unsubscribeRef.current === unsubscribe) {
        unsubscribeRef.current = null;
      }
    };
  }, [path, enabled]);

  return {
    abort: useCallback(() => unsubscribeRef.current?.(), []),
  };
}
