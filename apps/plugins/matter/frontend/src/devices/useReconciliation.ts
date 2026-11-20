import { useCallback } from 'react';
import { useMatterLive } from '../useMatterLive';
import { useMatterResource, type MatterResource } from '../useMatterResource';
import { getReconciliation, type ReconciliationStatus } from './api';

/** Status of the last reconciliation. A run that changes devices announces itself on the `devices` topic. */
export function useReconciliation(enabled: boolean): MatterResource<ReconciliationStatus> {
  const load = useCallback(() => getReconciliation(), []);
  const resource = useMatterResource(load, enabled);
  useMatterLive({ topic: 'devices', enabled, refetch: resource.refetch });
  return resource;
}
