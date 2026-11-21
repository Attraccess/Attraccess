import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { getWallSnapshot, wallEventsUrl } from '../api';

/** Fallback refresh: picks up renamed or re-pictured resources and maintenance that starts on schedule. */
export const POLL_INTERVAL_MS = 60_000;
/** Several changes in a burst (a session ends, another starts) cost one refetch. */
const CHANGE_DEBOUNCE_MS = 500;

/** Unknown, replaced and deleted links all answer 404. */
const isGone = (error: unknown) => (error as { status?: number } | null)?.status === 404;

/** The wall behind a public link, refetched whenever the server reports a change and on a slow timer. */
export function useWallSnapshot(token: string) {
  const queryClient = useQueryClient();
  const queryKey = ['status-wall', 'snapshot', token];

  const query = useQuery({
    queryKey,
    queryFn: () => getWallSnapshot(token),
    refetchInterval: (current) => (isGone(current.state.error) ? false : POLL_INTERVAL_MS),
    refetchIntervalInBackground: true,
    retry: (failures, error) => !isGone(error) && failures < 3,
  });

  const gone = isGone(query.error);

  useEffect(() => {
    if (gone || typeof EventSource === 'undefined') return;
    const source = new EventSource(wallEventsUrl(token));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(
        () => void queryClient.invalidateQueries({ queryKey: ['status-wall', 'snapshot', token] }),
        CHANGE_DEBOUNCE_MS,
      );
    };
    source.addEventListener('changed', refresh);
    // Changes during a reconnect were missed: the browser reconnects on its own, then the wall reloads once.
    let opened = false;
    source.addEventListener('open', () => {
      if (opened) refresh();
      opened = true;
    });
    return () => {
      clearTimeout(timer);
      source.close();
    };
  }, [token, gone, queryClient]);

  return { ...query, gone };
}
