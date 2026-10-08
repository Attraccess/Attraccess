import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useToastMessage } from '../components/toastProvider';
import logoutEn from './logout.en.json';
import logoutDe from './logout.de.json';
import { restoreAuthentication } from '../utils/auth-session';
import { stopLiveUpdates } from '../utils/live-updates';
import { useNavigate } from 'react-router-dom';
import {
  OpenAPI,
  useAuthenticationServiceCreateSession,
  AuthenticationService,
  useAuthenticationServiceGetLogoutCapability,
  useTwoFactorAuthenticationServiceGetTwoFactorStatus,
  useUsersServiceGetCurrent,
  UseUsersServiceGetCurrentKeyFn,
  type User,
} from '@attraccess/react-query-client';
import { useCallback, useEffect, useState } from 'react';
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type SystemPermission } from '@attraccess/shared';

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
    onSuccess: () => restoreAuthentication(queryClient),
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
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [isInitialized, setIsInitialized] = useState(false);
  const { data: logoutStatus } = useQuery({
    queryKey: ['auth-logout-status'],
    queryFn: () => 'idle' as string,
    initialData: 'idle',
    enabled: false,
  });
  const hasStartedLogout = logoutStatus !== 'idle';
  const { t: logoutText } = useTranslations({ en: logoutEn, de: logoutDe });
  const { error: showError, warning, info } = useToastMessage();
  const logoutPending = useIsMutating({ mutationKey: ['auth-logout'] }) > 0;

  useEffect(() => {
    const url = new URL(window.location.href);
    const result = url.searchParams.get('ssoLogout');
    if (!['failed', 'partial', 'returned'].includes(result ?? '')) return;
    url.searchParams.delete('ssoLogout');
    window.history.replaceState(null, '', url.toString());
    const key = result === 'partial' ? 'callbackPartial' : result === 'failed' ? 'callbackFailed' : 'callbackReturned';
    info({ title: logoutText('localOnly'), description: logoutText(key), duration: 10000 });
  }, [info, logoutText]);

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
    enabled: isInitialized && !hasStartedLogout, // Stop identity refetch while signing out
  }) as { data: UserWithEffectivePermissions | undefined };

  const { data: twoFactorStatus, isLoading: isTwoFactorStatusLoading } =
    useTwoFactorAuthenticationServiceGetTwoFactorStatus(undefined, {
      enabled: isInitialized && !!currentUser,
    });

  const { data: logoutCapability, isLoading: isLogoutCapabilityLoading } = useAuthenticationServiceGetLogoutCapability(
    undefined,
    {
      enabled: isInitialized && !!currentUser && !hasStartedLogout,
      retry: false,
      staleTime: 30000,
    },
  );

  const logoutMutation = useMutation({
    mutationKey: ['auth-logout'],
    mutationFn: (everywhere: boolean) =>
      everywhere ? AuthenticationService.logoutEverywhere() : AuthenticationService.endSession().then(() => undefined),
    onSuccess: async (result) => {
      stopLiveUpdates();
      await queryClient.cancelQueries();
      queryClient.setQueryData(['auth-logout-status'], 'ended');
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'auth-logout-status' });
      queryClient.getMutationCache().clear();
      queryClient.setQueryData(UseUsersServiceGetCurrentKeyFn(), null);
      if (result?.kind === 'redirect' && result.redirectUrl) {
        window.location.assign(result.redirectUrl);
      } else {
        navigate('/', { replace: true });
        if (result?.reason)
          warning({
            title: logoutText('localOnly'),
            description: logoutText(`reasons.${result.reason}`),
            duration: 10000,
          });
      }
    },
    onError: async () => {
      stopLiveUpdates();
      await queryClient.cancelQueries();
      queryClient.setQueryData(['auth-logout-status'], 'ended');
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'auth-logout-status' });
      queryClient.getMutationCache().clear();
      queryClient.setQueryData(UseUsersServiceGetCurrentKeyFn(), null);
      navigate('/', { replace: true });
      showError({
        title: logoutText('networkError'),
        description: logoutText('networkErrorDescription'),
        duration: 15000,
      });
    },
  });

  const startLogout = useCallback(
    (everywhere: boolean) => {
      if (
        queryClient.getQueryData(['auth-logout-status']) !== 'idle' ||
        queryClient.isMutating({ mutationKey: ['auth-logout'] })
      )
        return;
      queryClient.setQueryData(['auth-logout-status'], 'pending');
      logoutMutation.mutate(everywhere);
    },
    [queryClient, logoutMutation],
  );
  const logout = useCallback(() => startLogout(false), [startLogout]);
  const logoutEverywhere = useCallback(() => startLogout(true), [startLogout]);
  const logoutUnavailableReason = isLogoutCapabilityLoading
    ? logoutText('checking')
    : logoutText(`reasons.${logoutCapability?.reason ?? 'provider_unavailable'}`);

  return {
    user: logoutStatus === 'ended' ? null : (currentUser ?? null),
    isAuthenticated: logoutStatus !== 'ended' && !!currentUser,
    isInitialized,
    logout,
    logoutEverywhere,
    logoutPending,
    canLogoutEverywhere: logoutCapability?.available ?? false,
    logoutUnavailableReason,
    logoutEverywhereLabel: logoutText('logoutEverywhere'),
    logoutPendingLabel: logoutText('pending'),
    logoutProviderNotice: logoutText('providerNotice'),
    twoFactorStatus,
    isTwoFactorStatusLoading,
    needsTwoFactorSetup: !!twoFactorStatus?.required && !twoFactorStatus?.enabled,
    hasPermission: (permission: SystemPermission) => {
      const effectivePermissions: string[] = currentUser?.effectivePermissions ?? [];
      return effectivePermissions.includes(permission);
    },
  };
}
