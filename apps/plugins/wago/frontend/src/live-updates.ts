import { usePluginLiveUpdates } from '@attraccess/plugins-frontend-sdk';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';

/** Initial reads/mutations remain REST; recurring snapshots use the host's stream. */
export function useWagoLiveQuery(queryKey: QueryKey, topic: string, identifier?: string, enabled = true) {
  const client = useQueryClient();
  const refresh = () => {
    void client.invalidateQueries({ queryKey });
  };
  return usePluginLiveUpdates<{ eventType: 'snapshot'; value: unknown } | { eventType: 'unavailable' }>({
    plugin: 'wago',
    topic,
    identifier,
    enabled,
    onUpdate: (event) => {
      if (event.eventType === 'snapshot') client.setQueryData(queryKey, event.value);
      else refresh();
    },
    onReconnect: refresh,
  });
}
