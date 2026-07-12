import { useNavigate } from 'react-router-dom';
import {
  OpenAPI,
  useAuthenticationServiceCreateSession,
  useAuthenticationServiceEndSession,
  useTwoFactorAuthenticationServiceGetTwoFactorStatus,
  useUsersServiceGetCurrent,
  UseUsersServiceGetCurrentKeyFn,
  type User,
} from '@attraccess/react-query-client';
import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

// The GET /users/me response includes effectivePermissions at runtime even though the
// generated User type does not declare it (the field is added by the profile controller).
type UserWithEffectivePermissions = User & { effectivePermissions?: string[] };

interface LoginCredentials {
  username: string;
  password: string;
  twoFactorCode?: string;
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
        requestBody: {
          username: data.username,
          password: data.password,
          twoFactorCode: data.twoFactorCode,
          tokenLocation: data.tokenLocation,
        },
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
  }) as { data: UserWithEffectivePermissions | undefined };

  const { data: twoFactorStatus, isLoading: isTwoFactorStatusLoading } =
    useTwoFactorAuthenticationServiceGetTwoFactorStatus(undefined, {
      enabled: isInitialized && !!currentUser,
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
    twoFactorStatus,
    isTwoFactorStatusLoading,
    needsTwoFactorSetup: !!twoFactorStatus?.required && !twoFactorStatus?.enabled,
    hasPermission: (permission: string) => {
      const effectivePermissions: string[] = currentUser?.effectivePermissions ?? [];
      return effectivePermissions.includes(permission);
    },
  };
}
