import { useCallback, useRef, useEffect } from 'react';
import { getBaseUrl } from '../api';
import { events } from 'fetch-event-stream';

interface Props<TPacket> {
  path: string;
  onUpdate: (data: TPacket) => void;
  enabled?: boolean;
}

export function useSSE<TPacket>(props: Props<TPacket>) {
  const { path, onUpdate, enabled = true } = props;

  const abortController = useRef<AbortController | null>(null);

  // Use a ref so onUpdate changes don't force reconnects
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const connect = useCallback(async () => {
    if (!enabled) {
      return;
    }

    const url = `${getBaseUrl()}${path}`;

    if (abortController.current) {
      abortController.current.abort();
    }
    abortController.current = new AbortController();

    try {
      const res = await fetch(url, {
        method: 'GET',
        credentials: 'include', // Include cookies for authentication
        signal: abortController.current.signal,
      });

      if (!res.ok) {
        // Silently handle 401 errors - user is not authenticated, which is expected on some pages
        if (res.status === 401) {
          return;
        }
        throw new Error(`Failed to connect to SSE: ${res.status} ${res.statusText}`);
      }

      const stream = events(res, abortController.current.signal);

      for await (const event of stream) {
        try {
          const nextPacket = JSON.parse(event.data as string);

          if (nextPacket.keepalive) {
            continue;
          }

          onUpdateRef.current(nextPacket);
        } catch (parseError) {
          console.error('[FlowContext] Error parsing event data:', parseError, event);
        }
      }
    } catch (error) {
      // Only log non-401 errors and abort errors (which are expected when component unmounts)
      if (error instanceof Error && error.name !== 'AbortError' && !error.message.includes('401')) {
        console.error('[SSE] Connection error:', error);
      }
    }
  }, [path, enabled]); // onUpdate removed: always reads latest via ref

  useEffect(() => {
    if (!enabled) {
      if (abortController.current) {
        abortController.current.abort();
        abortController.current = null;
      }
      return;
    }

    if (!abortController.current) {
      connect();
    }

    return () => {
      if (abortController.current) {
        abortController.current.abort();
        abortController.current = null;
      }
    };
  }, [connect, enabled]);

  return {
    abort: () => {
      if (abortController.current) {
        abortController.current.abort();
        abortController.current = null;
      }
    },
  };
}
