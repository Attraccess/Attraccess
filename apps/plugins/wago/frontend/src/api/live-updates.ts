import { usePluginLiveUpdates } from '@attraccess/plugins-frontend-sdk';
import { useQueryClient, type Query, type QueryKey, type QueryState } from '@tanstack/react-query';

// Duplicate consumers share the query; only its latest live event may restore state.
const liveStates = new WeakMap<Query, { state: QueryState; pendingRead: Query['promise'] }>();

/** Initial reads/mutations remain REST; the host stream owns snapshots and reconnect refresh. */
export function useWagoLiveQuery(queryKey: QueryKey, topic: string, identifier?: string, enabled = true) {
  const client = useQueryClient();
  const onUpdate = (event: { eventType: 'snapshot'; value: unknown } | { eventType: 'unavailable' }) => {
    const existingQuery = client.getQueryCache().find({ queryKey, exact: true });
    const previous = existingQuery && liveStates.get(existingQuery);
    const cancellation = client.cancelQueries({ queryKey, exact: true });
    if (event.eventType === 'snapshot') {
      client.setQueryData(queryKey, event.value);
    } else {
      // Retain the last snapshot, but show it as unavailable until the sampler recovers.
      // Updating cache state does not start a REST read for each browser consumer.
      const query = client.getQueryCache().find({ queryKey, exact: true });
      query?.setState({
        // A queued REST commit may have replaced the preceding live snapshot.
        // Retain that snapshot only while restoration for the same read is pending.
        ...(existingQuery === query && previous?.pendingRead === query.promise ? previous?.state : undefined),
        status: 'error',
        error: new Error('Live updates are temporarily unavailable.'),
        errorUpdatedAt: Date.now(),
      });
    }
    const query = client.getQueryCache().find({ queryKey, exact: true });
    if (!query) return;
    const state = query.state;
    const pendingRead = query.promise;
    liveStates.set(query, { state, pendingRead });
    const current = () =>
      liveStates.get(query)?.state === state &&
      query.promise === pendingRead &&
      client.getQueryCache().find({ queryKey, exact: true }) === query;
    const restore = () => {
      if (current() && (query.state !== state || query.state.fetchStatus !== 'idle')) {
        query.setState({ ...state, fetchStatus: 'idle' });
      }
    };
    // A settled retryer cannot be cancelled, and its read may commit after the cancellation drained (the order
    // depends on react-query internals). Restore the live state again when that read commits.
    const cache = client.getQueryCache();
    const unsubscribe = cache.subscribe((cacheEvent) => {
      if (cacheEvent.query !== query) return;
      // setQueryData (a newer live event) dispatches a manual success; only the read's own result counts.
      const { action } = cacheEvent.type === 'updated' ? cacheEvent : { action: undefined };
      const commit = (action?.type === 'success' && !action.manual) || action?.type === 'error';
      if (!commit && cacheEvent.type !== 'removed' && current()) return;
      unsubscribe();
      restore();
      if (liveStates.get(query)?.state === state) liveStates.delete(query);
    });
    return cancellation.then(() => {
      restore();
      // Nothing left to commit: no read was pending, or it already settled.
      if (!pendingRead || query.state.fetchStatus === 'idle') {
        unsubscribe();
        if (current()) liveStates.delete(query);
      }
    });
  };
  return usePluginLiveUpdates({
    plugin: 'wago',
    topic,
    identifier,
    enabled,
    onUpdate,
    onUnavailable: () => onUpdate({ eventType: 'unavailable' }),
  });
}
