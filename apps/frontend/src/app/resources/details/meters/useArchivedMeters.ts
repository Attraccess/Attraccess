import { useListResourceMeters } from '@attraccess/react-query-client';

/**
 * The archived meters of a resource, for people who may edit it (`enabled`); used by MetersCard and ArchivedMeters.
 * Not polled: archived meters change only through the meter actions, which reload the list.
 */
export function useArchivedMeters(resourceId: number, enabled = true) {
  const { data = [] } = useListResourceMeters({ path: { resourceId }, query: { includeArchived: true } }, undefined, {
    enabled,
  });
  return data.filter((meter) => meter.archivedAt);
}
