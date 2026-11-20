import { useCallback } from 'react';
import { useMatterLive } from '../useMatterLive';
import { useMatterResource, type MatterResource } from '../useMatterResource';
import { getNode, type MatterNodeDetail } from './api';

/** One node with its endpoints, kept current by the `devices` live topic. */
export function useNodeDetail(
  nodeId: string,
  enabled: boolean,
): MatterResource<MatterNodeDetail> & { stale: boolean } {
  const load = useCallback(() => getNode(nodeId), [nodeId]);
  const resource = useMatterResource(load, enabled);
  const { stale } = useMatterLive({ topic: 'devices', enabled, refetch: resource.refetch });
  return { ...resource, stale };
}
