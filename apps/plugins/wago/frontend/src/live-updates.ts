import { usePluginLiveUpdates } from '@attraccess/plugins-frontend-sdk';
import { useQueryClient, type Query, type QueryKey, type QueryState } from '@tanstack/react-query';

// Duplicate consumers share the query; only its latest live event may restore state.
const liveStates = new WeakMap<Query, { state: QueryState; pendingRead: Query['promise'] }>();

/** Initial reads/mutations remain REST; the host stream owns snapshots and reconnect refresh. */
export function useWagoLiveQuery(queryKey: QueryKey, topic: string, identifier?: string, enabled = true) {
  const client = useQueryClient();
  return usePluginLiveUpdates<{ eventType: 'snapshot'; value: unknown } | { eventType: 'unavailable' }>({
    plugin: 'wago',
    topic,
    identifier,
    enabled,
    onUpdate: (event) => {
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
      // A settled retryer cannot be cancelled, but Query.fetch may still have its
      // cache commit queued. Drain cancellation before restoring authoritative state.
      return cancellation.then(() => {
        if (
          liveStates.get(query)?.state === state &&
          query.promise === pendingRead &&
          client.getQueryCache().find({ queryKey, exact: true }) === query
        ) {
          liveStates.delete(query);
          if (query.state !== state || query.state.fetchStatus !== 'idle') {
            query.setState({ ...state, fetchStatus: 'idle' });
          }
        }
      });
    },
  });
}
