import { useQuery } from '@tanstack/react-query';
import { useWagoLiveQuery } from '../api/live-updates';
import {
  getRuntimeUpdateStatus,
  getManagedAccessStatus,
  type CommissioningSession,
  type WagoController,
} from '../api/client';

export type ManagedAccessTarget = { controller: WagoController } | { session: CommissioningSession };

export function useRuntimeStatus(target: ManagedAccessTarget | null) {
  const controllerId = target && 'controller' in target ? target.controller.id : null;
  const sessionId = target && 'session' in target ? target.session.id : null;
  useWagoLiveQuery(
    ['wago', 'runtime-update', controllerId, sessionId],
    controllerId !== null ? 'runtime-update' : 'managed-access',
    String(controllerId ?? sessionId),
    !!target,
  );
  return useQuery({
    queryKey: ['wago', 'runtime-update', controllerId, sessionId],
    queryFn: () =>
      target && 'controller' in target
        ? getRuntimeUpdateStatus(target.controller.id)
        : target && 'session' in target
          ? getManagedAccessStatus(target.session.id)
          : Promise.reject(new Error('No controller selected')),
    enabled: !!target,
    staleTime: 4000,
    retry: false,
  });
}
