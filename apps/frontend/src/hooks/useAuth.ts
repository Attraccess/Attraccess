import { resumeLiveUpdates, stopLiveUpdates } from '../utils/live-updates';
import { useNavigate } from 'react-router-dom';
import {
  OpenAPI,
  useAuthenticationServiceCreateSession,
  useAuthenticationServiceEndSession,
  useTwoFactorAuthenticationServiceGetTwoFactorStatus,
  useUsersServiceGetCurrent,
  UseUsersServiceGetCurrentKeyFn,
} from '@attraccess/react-query-client';
import { useCallback, useEffect, useState } from 'react';
import { useIsMutating, useQueryClient } from '@tanstack/react-query';
import { type SystemPermission } from '@attraccess/shared';

interface LoginCredentials {
  username: string;
  password: string;
  twoFactorCode?: string;
  tokenLocation: 'cookie' | 'body';
}

const logoutMutationKey = ['end-session'];

export function useLogin() {
  const queryClient = useQueryClient();
  const login = useAuthenticationServiceCreateSession({
    onSuccess: () => {
      resumeLiveUpdates();
      queryClient.invalidateQueries({
        queryKey: UseUsersServiceGetCurrentKeyFn(),
      });
    },
  });

  return {
    ...login,
    mutate: (data: LoginCredentials, options?: Parameters<typeof login.mutate>[1]) => {
      return login.mutate({
        requestBody: {
          username: data.username,
          password: data.password,
          twoFactorCode: data.twoFactorCode,
          tokenLocation: data.tokenLocation,
        },
      }, options);
    },
    mutateAsync: async (data: { username: string; password: string }) => {
      return login.mutateAsync({ requestBody: { username: data.username, password: data.password } });
    },
  };
}

export function useAuth() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  // All hook instances must ignore the old session while its cookie is
  // still valid on the server, including late current-user responses.
  const isLoggingOut = useIsMutating({ mutationKey: logoutMutationKey }) > 0;

  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize API base URL and configure for cookie-based authentication
  useEffect(() => {
    const initializeAuth = () => {
      // Remove manual token setting - cookies will be handled automatically
      OpenAPI.TOKEN = '';
      // Enable credentials to include cookies in requests
      OpenAPI.WITH_CREDENTIALS = true;

      // Clean up any existing localStorage/sessionStorage auth data
      localStorage.removeItem('auth');
      sessionStorage.removeItem('auth');

      setIsInitialized(true);
    };

    initializeAuth();
  }, []);

  // Check authentication status by trying to fetch current user
  // This will work with cookies automatically
  const { data: fetchedUser } = useUsersServiceGetCurrent(undefined, {
    refetchInterval: 1000 * 60 * 20, // 20 minutes
    retry: false,
    enabled: isInitialized && !isLoggingOut,
  });
  const currentUser = isLoggingOut ? null : fetchedUser;

  const { data: twoFactorStatus, isLoading: isTwoFactorStatusLoading } =
    useTwoFactorAuthenticationServiceGetTwoFactorStatus(undefined, {
      enabled: isInitialized && !!currentUser,
    });

  const { mutate: deleteSession } = useAuthenticationServiceEndSession({
    mutationKey: logoutMutationKey,
    onSuccess: async () => {
      navigate('/', { replace: true });
      window.location.reload();
    },
  });

  const logout = useCallback(() => {
    stopLiveUpdates();
    queryClient.setQueryData(UseUsersServiceGetCurrentKeyFn(), null);
    queryClient.clear();
    deleteSession();
  }, [deleteSession, queryClient]);

  return {
    user: currentUser ?? null,
    isAuthenticated: !!currentUser,
    isInitialized,
    logout,
    twoFactorStatus,
    isTwoFactorStatusLoading,
    needsTwoFactorSetup: !!twoFactorStatus?.required && !twoFactorStatus?.enabled,
    hasPermission: (permission: SystemPermission) => {
      const effectivePermissions: string[] = currentUser?.effectivePermissions ?? [];
      return effectivePermissions.includes(permission);
    },
  };
}
