import { useCallback } from 'react';
import { useMatterLive } from '../useMatterLive';
import { useMatterResource, type MatterResource } from '../useMatterResource';
import { getEndpointState, type StateEntry } from './api';

/** The current state entries of one endpoint, kept current by the `device-state` topic of that endpoint. */
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
  return { ...resource, stale };
}
