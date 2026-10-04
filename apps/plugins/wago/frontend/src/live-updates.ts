import { usePluginLiveUpdates } from '@attraccess/plugins-frontend-sdk';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';

/** Initial reads/mutations remain REST; the host stream owns snapshots and reconnect refresh. */
export function useWagoLiveQuery(queryKey: QueryKey, topic: string, identifier?: string, enabled = true) {
  const client = useQueryClient();
  return usePluginLiveUpdates<{ eventType: 'snapshot'; value: unknown } | { eventType: 'unavailable' }>({
    plugin: 'wago',
    topic,
    identifier,
    enabled,
    onUpdate: (event) => {
      if (event.eventType === 'snapshot') {
        client.setQueryData(queryKey, event.value);
      } else {
        // Retain the last snapshot, but show it as unavailable until the sampler recovers.
        // Updating cache state does not start a REST read for each browser consumer.
        const query = client.getQueryCache().find({ queryKey, exact: true });
        query?.setState({
          status: 'error',
          error: new Error('Live updates are temporarily unavailable.'),
          errorUpdatedAt: Date.now(),
        });
      }
    },
  });
}
