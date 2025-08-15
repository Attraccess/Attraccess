import { useNavigate } from 'react-router-dom';
import {
  OpenAPI,
  SystemPermissions,
  useAuthenticationServiceCreateSession,
  useAuthenticationServiceEndSession,
  useUsersServiceGetCurrent,
  UseUsersServiceGetCurrentKeyFn,
} from '@attraccess/react-query-client';
import { useCallback, useEffect, useState } from 'react';
import { getBaseUrl } from '../api';
import { useQueryClient } from '@tanstack/react-query';

interface LoginCredentials {
  username: string;
  password: string;
  tokenLocation: 'cookie' | 'body';
}

export function useLogin() {
  const queryClient = useQueryClient();
  const login = useAuthenticationServiceCreateSession({
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: UseUsersServiceGetCurrentKeyFn(),
      });
    },
  });

  return {
    ...login,
    mutate: async (data: LoginCredentials) => {
      return login.mutate({
        requestBody: { username: data.username, password: data.password, tokenLocation: data.tokenLocation },
      });
    },
    mutateAsync: async (data: { username: string; password: string }) => {
      return login.mutateAsync({ requestBody: { username: data.username, password: data.password } });
    },
  };
}

export function useAuth() {
  const navigate = useNavigate();

  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize API base URL and configure for cookie-based authentication
  useEffect(() => {
    const initializeAuth = () => {
      OpenAPI.BASE = getBaseUrl();
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
  const { data: currentUser } = useUsersServiceGetCurrent(undefined, {
    refetchInterval: 1000 * 60 * 20, // 20 minutes
    retry: false,
    enabled: isInitialized, // Only fetch when initialized
  });

  const { mutate: deleteSession } = useAuthenticationServiceEndSession({
    onSuccess: async () => {
      navigate('/', { replace: true });
      window.location.reload();
    },
  });

  const logout = useCallback(() => {
    deleteSession();
  }, [deleteSession]);

  return {
    user: currentUser ?? null,
    isAuthenticated: !!currentUser,
    isInitialized,
    logout,
    hasPermission: (permission: keyof SystemPermissions) => {
      if (!currentUser?.systemPermissions || typeof currentUser.systemPermissions !== 'object') {
        return false;
      }
      return (currentUser.systemPermissions as SystemPermissions)[permission] ?? false;
    },
  };
}
