import { useCallback, useRef, useEffect } from 'react';
import { getBaseUrl } from '../api';
import { events } from 'fetch-event-stream';

interface Props<TPacket> {
  path: string;
  onUpdate: (data: TPacket) => void;
}

export function useSSE<TPacket>(props: Props<TPacket>) {
  const { path, onUpdate } = props;

  const abortController = useRef<AbortController | null>(null);

  const connect = useCallback(async () => {
    const url = `${getBaseUrl()}${path}`;

    if (abortController.current) {
      abortController.current.abort();
    }
    abortController.current = new AbortController();

    const res = await fetch(url, {
      method: 'GET',
      credentials: 'include', // Include cookies for authentication
      signal: abortController.current.signal,
    });

    if (!res.ok) {
      throw new Error(`Failed to connect to SSE: ${res.status} ${res.statusText}`);
    }

    const stream = events(res, abortController.current.signal);

    for await (const event of stream) {
      try {
        const nextPacket = JSON.parse(event.data as string);

        if (nextPacket.keepalive) {
          continue;
        }

        onUpdate(nextPacket);
      } catch (parseError) {
        console.error('[FlowContext] Error parsing event data:', parseError, event);
      }
    }
  }, [onUpdate, path]);

  useEffect(() => {
    if (abortController.current) {
      return;
    }
    connect();
  }, [connect]);

  return {
    abort: () => {
      if (abortController.current) {
        abortController.current.abort();
        abortController.current = null;
      }
    },
  };
}
