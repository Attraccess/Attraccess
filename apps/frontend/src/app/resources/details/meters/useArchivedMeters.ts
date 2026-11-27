import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useListResourceMeters, UseListResourceMetersKeyFn } from '@attraccess/react-query-client';

/**
 * The archived meters of a resource for MetersCard, which shows them through ArchivedMeters to people who may edit it
 * (`enabled`). Not polled: the meter actions reload it, and so does a change of the active meters, which MetersCard
 * polls (someone else archived or restored one).
 */
export function useArchivedMeters(resourceId: number, enabled: boolean) {
  const queryClient = useQueryClient();
  const { data: active } = useListResourceMeters({ path: { resourceId } }, undefined, { enabled });
  const { data = [] } = useListResourceMeters({ path: { resourceId }, query: { includeArchived: true } }, undefined, {
    enabled,
  });
  const activeIds = active?.map((meter) => meter.id).join(',');
  const seen = useRef(activeIds);
  useEffect(() => {
    if (activeIds === undefined || activeIds === seen.current) return;
    const first = seen.current === undefined;
    seen.current = activeIds;
    if (!first)
      void queryClient.invalidateQueries({
        queryKey: UseListResourceMetersKeyFn({ path: { resourceId }, query: { includeArchived: true } }),
      });
  }, [activeIds, queryClient, resourceId]);
  return data.filter((meter) => meter.archivedAt);
}
