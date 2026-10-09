import { createPluginApiClient } from '@attraccess/plugins-frontend-sdk';
import { useQuery } from '@tanstack/react-query';
import type { WagoDiagnostics } from '../../diagnostics-types';
import { useWagoLiveQuery } from './live-updates';
export type { WagoDiagnostics } from '../../diagnostics-types';

const api = createPluginApiClient('/api/wago');
export function useWagoDiagnostics(controllerId: number | null) {
  useWagoLiveQuery(['wago', 'diagnostics', controllerId], 'diagnostics', String(controllerId), controllerId !== null);
  return useQuery<WagoDiagnostics>({
    queryKey: ['wago', 'diagnostics', controllerId],
    queryFn: () => api.request<WagoDiagnostics>(`/controllers/${controllerId}/diagnostics`),
    enabled: controllerId !== null,
    retry: 1,
  });
}
