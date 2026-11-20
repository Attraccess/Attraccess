import { useCallback, useEffect } from 'react';
import { useDocumentVisible } from '../useDocumentVisible';
import { useMatterLive } from '../useMatterLive';
import { useMatterResource, type MatterResource } from '../useMatterResource';
import { getEndpointState, type StateEntry } from './api';

/** Without a deadline from the API, current entries are re-read this often so they can turn stale. */
export const STATE_FRESHNESS_RECHECK_MS = 60_000;
/** Never re-read sooner than this. */
const MIN_RECHECK_MS = 10_000;

/** When the first current entry turns stale (the API computes freshness at read time and signals nothing then). */
function recheckDelay(states: readonly StateEntry[], now: number): number | null {
  const current = states.filter((entry) => entry.freshness === 'fresh');
  if (current.length === 0) return null;
  const deadlines = current.map((entry) => {
    if (!entry.reported.observedAt || entry.staleAfterMs === undefined) return STATE_FRESHNESS_RECHECK_MS;
    const untilStale = Date.parse(entry.reported.observedAt) + entry.staleAfterMs - now;
    // Already past (the server still said current, so this clock runs ahead) or unreadable: fall back to the interval.
    return Number.isFinite(untilStale) && untilStale > 0 ? untilStale + 1_000 : STATE_FRESHNESS_RECHECK_MS;
  });
  return Math.max(Math.min(...deadlines), MIN_RECHECK_MS);
}

/**
 * The current state entries of one endpoint, kept current by the `device-state` topic of that endpoint, and read
 * again when a current entry is due to turn stale (not while the browser tab is hidden).
 */
export function useEndpointState(
  endpointRef: string,
  enabled: boolean,
): MatterResource<{ endpointRef: string; states: StateEntry[] }> & { stale: boolean } {
  const load = useCallback(() => getEndpointState(endpointRef), [endpointRef]);
  const resource = useMatterResource(load, enabled);
  const { stale } = useMatterLive({
    topic: 'device-state',
    identifier: endpointRef,
    enabled,
    refetch: resource.refetch,
  });
  const { data, refetch } = resource;
  const visible = useDocumentVisible();

  useEffect(() => {
    if (!enabled || !visible || !data) return;
    const delay = recheckDelay(data.states, Date.now());
    if (delay === null) return;
    const timer = setTimeout(() => void refetch(), delay);
    return () => clearTimeout(timer);
  }, [enabled, visible, data, refetch]);

  return { ...resource, stale };
}
