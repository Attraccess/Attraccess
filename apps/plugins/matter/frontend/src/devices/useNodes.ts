import { useCallback } from 'react';
import { useMatterLive } from '../useMatterLive';
import { useMatterResource, type MatterResource } from '../useMatterResource';
import { listNodes, type MatterNodeSummary } from './api';

/** The node list, kept current by the `devices` live topic. Only requested with `enabled` (`matter.devices.read`). */
export function useNodes(includeInactive: boolean, enabled: boolean): MatterResource<MatterNodeSummary[]> & { stale: boolean } {
  const load = useCallback(() => listNodes(includeInactive), [includeInactive]);
  const resource = useMatterResource(load, enabled);
  const { stale } = useMatterLive({ topic: 'devices', enabled, refetch: resource.refetch });
  return { ...resource, stale };
}
