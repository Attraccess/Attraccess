import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useToastMessage } from '../components/toastProvider';
import logoutEn from './logout.en.json';
import logoutDe from './logout.de.json';
import { restoreAuthentication } from '../utils/auth-session';
import { stopLiveUpdates } from '../utils/live-updates';
import { useNavigate } from 'react-router-dom';
import {
  useCreateSession,
  ApiError,
  useGetLogoutCapability,
  useGetTwoFactorStatus,
  UseGetCurrentKeyFn,
  endSession,
  logoutEverywhere as requestLogoutEverywhere,
  consumeLogoutResult,
  getCurrent,
} from '@attraccess/react-query-client';
import { useCallback, useEffect, useState } from 'react';
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type SystemPermission } from '@attraccess/shared';
import { shouldRetryCurrentUser } from '../api/retryRules';
import { isUnauthenticatedError } from '../api/isUnauthenticatedError';
import { deriveAuthStatus } from './deriveAuthStatus';

interface LoginCredentials {
  username: string;
  password: string;
  twoFactorCode?: string;
  tokenLocation: 'cookie' | 'body';
}

export function useLogin() {
  const queryClient = useQueryClient();
  const login = useCreateSession(undefined, {
    onSuccess: () => restoreAuthentication(queryClient),
  });

  return {
    ...login,
    mutate: (data: LoginCredentials, options?: Parameters<typeof login.mutate>[1]) => {
      return login.mutate(
        {
          body: {
            username: data.username,
            password: data.password,
            twoFactorCode: data.twoFactorCode,
            tokenLocation: data.tokenLocation,
          },
        },
        options,
      );
    },
    mutateAsync: async (data: { username: string; password: string }) => {
      return login.mutateAsync({ body: { username: data.username, password: data.password } });
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

  // Initialize API base URL and configure for cookie-based authentication
  useEffect(() => {
    const initializeAuth = () => {
      // configureApiClient() sends the session cookies with every request.
      // Clean up any existing localStorage/sessionStorage auth data
      for (const area of ['localStorage', 'sessionStorage'] as const) {
        try {
          window[area].removeItem('auth');
        } catch {
          // Cookie authentication works even when legacy token storage is unavailable.
        }
      }

      setIsInitialized(true);
    };

    initializeAuth();
  }, []);

  // Check authentication status by trying to fetch current user
  // This will work with cookies automatically
  const {
    data: fetchedUser,
    error: currentUserError,
    errorUpdatedAt: currentUserErrorUpdatedAt,
    isFetching: isCurrentUserFetching,
    refetch: refetchCurrentUser,
  } = useQuery({
    queryKey: UseGetCurrentKeyFn(),
    queryFn: async ({ signal }) => {
      try {
        return await getCurrent({ signal, throwOnError: true }).then(({ data }) => data);
      } catch (error) {
        // A 401 without a cached user is the answer "signed out", not a failure: as data it survives refetches
        // (window focus, the interval), so the login form stays mounted. A cached user keeps the error, so a
        // background 401 does not sign the user out (unchanged behaviour).
        if (isUnauthenticatedError(error) && !queryClient.getQueryData(UseGetCurrentKeyFn())) return null;
        throw error;
      }
    },
    refetchInterval: 1000 * 60 * 20, // 20 minutes
    // Only a 401 means signed out; a 5xx or network error is retried instead of ending the session.
    retry: shouldRetryCurrentUser,
    enabled: isInitialized && !hasStartedLogout, // Stop identity refetch while signing out
  });
  // Ignore late identity responses as soon as either logout action starts.
  const currentUser = hasStartedLogout ? null : fetchedUser;
  // Derived from the shared query state, so every useAuth instance agrees.
  const authStatus = deriveAuthStatus({
    isInitialized,
    logoutStatus,
    data: fetchedUser,
    error: currentUserError,
    isFetching: isCurrentUserFetching,
    hasFailedBefore: currentUserErrorUpdatedAt > 0,
  });
  const retryCurrentUser = useCallback(() => {
    void refetchCurrentUser();
  }, [refetchCurrentUser]);

  const [returnToken] = useState(() => new URL(window.location.href).searchParams.get('ssoLogout'));
  const { data: providerReturn, isFetched: isReturnFetched } = useQuery({
    queryKey: ['auth-logout-return', returnToken],
    enabled: isInitialized && /^[A-Za-z0-9_-]{43}$/.test(returnToken ?? ''),
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!returnToken) return null;
      const outcome = await consumeLogoutResult({ body: { token: returnToken }, throwOnError: true }).then(
        ({ data }) => data,
      );
      // Check the server, rather than cached user data, before claiming local sign-out.
      try {
        await getCurrent({ throwOnError: true }).then(({ data }) => data);
        return null;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return outcome.result;
        return null;
      }
    },
  });
  useEffect(() => {
    if (!returnToken || (!isReturnFetched && /^[A-Za-z0-9_-]{43}$/.test(returnToken))) return;
    const url = new URL(window.location.href);
    // Several components use this hook; consuming the URL also prevents duplicate notices.
    if (url.searchParams.get('ssoLogout') !== returnToken) return;
    url.searchParams.delete('ssoLogout');
    // Keep React Router's entry state: without its index, browser Back would skip navigation blockers.
    window.history.replaceState(window.history.state, '', url.toString());
    queryClient.setQueryData(['auth-logout-return', returnToken], null);
    if (!providerReturn || currentUser) return;
    const key =
      providerReturn === 'partial'
        ? 'callbackPartial'
        : providerReturn === 'failed'
          ? 'callbackFailed'
          : 'callbackReturned';
    info({ title: logoutText('localOnly'), description: logoutText(key), duration: 10000 });
  }, [returnToken, isReturnFetched, providerReturn, currentUser, queryClient, info, logoutText]);

  const { data: twoFactorStatus, isLoading: isTwoFactorStatusLoading } = useGetTwoFactorStatus({}, undefined, {
    enabled: isInitialized && !!currentUser,
  });

  const { data: logoutCapability, isLoading: isLogoutCapabilityLoading } = useGetLogoutCapability({}, undefined, {
    enabled: isInitialized && !!currentUser && !hasStartedLogout,
    retry: false,
    staleTime: 30000,
  });

  const logoutMutation = useMutation({
    mutationKey: ['auth-logout'],
    mutationFn: (everywhere: boolean) =>
      everywhere
        ? requestLogoutEverywhere({ throwOnError: true }).then(({ data }) => data)
        : endSession({ throwOnError: true })
            .then(({ data }) => data)
            .then(() => undefined),
    onSuccess: async (result) => {
      stopLiveUpdates();
      await queryClient.cancelQueries();
      queryClient.setQueryData(['auth-logout-status'], 'ended');
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'auth-logout-status' });
      queryClient.getMutationCache().clear();
      queryClient.setQueryData(UseGetCurrentKeyFn(), null);
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
      queryClient.setQueryData(UseGetCurrentKeyFn(), null);
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
      stopLiveUpdates();
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
    /** loading until the first current-user answer; error when it failed with something other than a 401. */
    authStatus,
    /** Loads the current user again, for example from the error screen. */
    retryCurrentUser,
    isCurrentUserFetching,
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
    /** For keys only known at runtime: plugin-declared keys from route configs or the permission catalog. */
    hasPermissionKey: (key: string) => {
      const effectivePermissions: string[] = currentUser?.effectivePermissions ?? [];
      return effectivePermissions.includes(key);
    },
  };
}
