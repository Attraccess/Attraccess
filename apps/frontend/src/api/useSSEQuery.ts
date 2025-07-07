import { useQuery, QueryKey, useQueryClient, UseQueryOptions } from '@tanstack/react-query';
import { useCallback, useRef, useEffect } from 'react';
import { events } from 'fetch-event-stream';

interface Props<TQueryFnData> {
  queryKey: QueryKey;
  url: string;
  init?: RequestInit;
  onData?: (data: TQueryFnData) => void;
  queryOptions?: Omit<UseQueryOptions<TQueryFnData[]>, 'queryKey' | 'queryFn'>;
}

export function useSSEQuery<TQueryFnData = unknown>(props: Props<TQueryFnData>) {
  const { queryKey, url, init, onData, queryOptions } = props;

  const queryClient = useQueryClient();
  const abortController = useRef<AbortController>();

  // Cleanup function to abort the connection
  const cleanup = useCallback(() => {
    if (abortController.current) {
      abortController.current.abort();
      abortController.current = undefined;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  const connect = useCallback(async () => {
    // Clean up any existing connection
    cleanup();

    abortController.current = new AbortController();

    const res = await fetch(url, {
      ...init,
      signal: abortController.current.signal,
    });

    if (!res.ok) {
      throw new Error('Failed to connect to SSE');
    }

    const stream = events(res, abortController.current.signal);
    const packets: TQueryFnData[] = [];
    for await (const event of stream) {
      const nextPacket = JSON.parse(event.data as string);
      if (nextPacket.keepalive) {
        continue;
      }

      packets.push(nextPacket);
      onData?.(nextPacket);

      queryClient.setQueriesData({ queryKey: queryKey }, packets);
    }

    return packets;
  }, [url, init, queryClient, queryKey, cleanup, onData]);

  return useQuery<TQueryFnData[]>({ queryKey: queryKey, queryFn: connect, initialData: [], ...queryOptions });
}
