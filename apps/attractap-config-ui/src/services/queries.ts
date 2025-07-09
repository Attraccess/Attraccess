import { useMutation, useQuery, useQueryClient, UseQueryOptions } from '@tanstack/react-query';
import { getConfig, getStatus, login, logout, saveConfig } from './api';
import { ConfigData, LoginFormData, StatusData } from '../types';
import { QUERY_KEYS } from './queryKeys';
import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext';

export function useLogin() {
  const queryClient = useQueryClient();

  const authContext = useContext(AuthContext);

  return useMutation({
    mutationFn: (data: LoginFormData) => login(data),
    onSuccess: (data) => {
      if (data.success) {
        queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.AUTH] });
      }

      authContext?.setIsAuthenticated(data?.success ?? false);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.AUTH] });
    },
  });
}

// Status hook
export function useStatus(queryOptions?: Omit<UseQueryOptions<StatusData>, 'queryKey' | 'queryFn'>) {
  return useQuery<StatusData>({
    queryKey: [QUERY_KEYS.STATUS],
    queryFn: getStatus,
    ...queryOptions,
  });
}

// Config hooks
export function useConfig() {
  return useQuery({
    queryKey: [QUERY_KEYS.CONFIG],
    queryFn: getConfig,
  });
}

export function useSaveConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (config: ConfigData) => saveConfig(config),
    onSuccess: (data) => {
      if (data.success) {
        queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.CONFIG] });
      }
    },
  });
}
