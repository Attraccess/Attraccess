import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useListResourceMeters, UseListResourceMetersKeyFn } from '@attraccess/react-query-client';

/** A reload of the archived meters this recent already reflects a change of the active ones. */
const FRESH_MS = 2_000;

/**
 * The archived meters of a resource for MetersCard, which shows them through ArchivedMeters to people who may edit it
 * (`enabled`). Not polled and not refetched on focus: the meter actions reload it, and so does a change of the active
 * meters, which MetersCard polls (someone else archived or restored one).
 */
export function useArchivedMeters(resourceId: number, enabled: boolean) {
  const queryClient = useQueryClient();
  const { data: active } = useListResourceMeters({ path: { resourceId } }, undefined, { enabled });
  const options = { path: { resourceId }, query: { includeArchived: true } };
  const { data = [], isError } = useListResourceMeters(options, undefined, { enabled, staleTime: Infinity });
  const activeIds = active?.map((meter) => meter.id).join(',');
  const seen = useRef(activeIds);
  useEffect(() => {
    if (activeIds === undefined || activeIds === seen.current) return;
    const first = seen.current === undefined;
    seen.current = activeIds;
    const queryKey = UseListResourceMetersKeyFn({ path: { resourceId }, query: { includeArchived: true } });
    const state = queryClient.getQueryState(queryKey);
    // After an action of this card both lists are reloaded already.
    const fresh = state?.fetchStatus === 'fetching' || (state?.dataUpdatedAt ?? 0) > Date.now() - FRESH_MS;
    if (!first && !fresh) void queryClient.invalidateQueries({ queryKey });
  }, [activeIds, queryClient, resourceId]);
  return { meters: data.filter((meter) => meter.archivedAt), isError };
}
