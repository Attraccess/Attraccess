import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  CreateSessionResponse,
  OpenAPI,
  SystemPermissions,
  useAuthenticationServiceCreateSession,
  useAuthenticationServiceEndSession,
  useAuthenticationServiceRefreshSession,
  useAuthenticationServiceRefreshSessionKey,
  useUsersServiceGetCurrent,
} from '@attraccess/react-query-client';
import { useCallback, useEffect, useState } from 'react';
import { getBaseUrl } from '../api';

interface LoginCredentials {
  username: string;
  password: string;
  tokenLocation: 'cookie' | 'body';
}

export function usePersistedAuth() {
  // This hook is now just a placeholder since initialization is handled in useAuth
  // We'll keep it for backward compatibility but it doesn't do anything
}

export function useRefreshSession() {
  const { isInitialized } = useAuth();
  const { data: refreshedSession } = useAuthenticationServiceRefreshSession({ tokenLocation: 'cookie' }, undefined, {
    refetchInterval: 1000 * 60 * 20, // 20 minutes,
    enabled: isInitialized,
    retryOnMount: false,
    refetchOnWindowFocus: false,
  });

  // Session refresh is now handled automatically by cookies
  // No need to manually update tokens or localStorage
  useEffect(() => {
    if (refreshedSession) {
      // Session was refreshed successfully, cookies are automatically updated by the server
      // No client-side token management needed
    }
  }, [refreshedSession]);
}

export function useLogin() {
  const { sessionLoginMutate } = useAuth();

  const login = useAuthenticationServiceCreateSession({
    onSuccess: (data) => {
      sessionLoginMutate(data);
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
  const queryClient = useQueryClient();
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

  const { mutate: sessionLoginMutate } = useMutation({
    mutationFn: async (auth: CreateSessionResponse) => {
      // No need to store auth data - cookies are handled automatically by the server
      if (!auth) {
        console.error('[sessionLoginMutate] auth is null');
        throw new Error('Auth is null');
      }

      // No manual token setting needed - cookies handle authentication
      // The server will have set the HTTP-only cookie automatically

      return auth;
    },
    onSuccess: () => {
      setTimeout(() => {
        // Invalidate all queries except the refresh session query to prevent infinite loop
        queryClient.invalidateQueries({
          predicate: (query) => {
            // Don't invalidate the refresh session query
            return !query.queryKey.includes(useAuthenticationServiceRefreshSessionKey);
          },
        });
      }, 1000);
    },
  });

  const { mutate: deleteSession } = useAuthenticationServiceEndSession({
    onSuccess: async () => {
      // No need to remove localStorage/sessionStorage - cookies are cleared by server
      // No manual token clearing needed - server clears the HTTP-only cookie

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
    sessionLoginMutate,
    logout,
    hasPermission: (permission: keyof SystemPermissions) => {
      if (!currentUser?.systemPermissions || typeof currentUser.systemPermissions !== 'object') {
        return false;
      }
      return (currentUser.systemPermissions as SystemPermissions)[permission] ?? false;
    },
  };
}
