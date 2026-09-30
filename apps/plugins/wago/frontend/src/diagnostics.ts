import { createPluginApiClient } from '@attraccess/plugins-frontend-sdk';
import { useQuery } from '@tanstack/react-query';
import type { WagoDiagnostics } from '../../diagnostics-types';
export type { WagoDiagnostics } from '../../diagnostics-types';

const api = createPluginApiClient('/api/wago');
export function useWagoDiagnostics(controllerId: number | null) {
  return useQuery<WagoDiagnostics>({
    queryKey: ['wago', 'diagnostics', controllerId],
    queryFn: () => api.request<WagoDiagnostics>(`/controllers/${controllerId}/diagnostics`),
    enabled: controllerId !== null,
    refetchInterval: 5_000,
    retry: 1,
  });
}
