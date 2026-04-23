import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { fetchCurrentVersion, fetchUpdateStatus } from './client';
import { UpdateStatus, VersionInfo } from './types';

export const CURRENT_VERSION_QUERY_KEY = ['version', 'current'] as const;
export const UPDATE_STATUS_QUERY_KEY = ['version', 'updates'] as const;

export const UPDATE_STATUS_STALE_MS = 60 * 60 * 1000;
export const UPDATE_STATUS_REFETCH_INTERVAL_MS = 60 * 60 * 1000;

export function useCurrentVersion(
  options?: Omit<UseQueryOptions<VersionInfo, Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery<VersionInfo, Error>({
    queryKey: CURRENT_VERSION_QUERY_KEY,
    queryFn: () => fetchCurrentVersion(),
    staleTime: Infinity,
    ...options,
  });
}

export function useUpdateStatus(
  options?: Omit<UseQueryOptions<UpdateStatus, Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery<UpdateStatus, Error>({
    queryKey: UPDATE_STATUS_QUERY_KEY,
    queryFn: () => fetchUpdateStatus(),
    staleTime: UPDATE_STATUS_STALE_MS,
    refetchInterval: UPDATE_STATUS_REFETCH_INTERVAL_MS,
    refetchOnWindowFocus: false,
    retry: false,
    ...options,
  });
}
