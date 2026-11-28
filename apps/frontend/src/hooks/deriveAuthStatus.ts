import { isUnauthenticatedError } from '../api/isUnauthenticatedError';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'error';

export interface AuthStatusInput {
  /** Whether useAuth finished its one-time setup (cookie auth, legacy storage cleanup). */
  isInitialized: boolean;
  /** The shared `auth-logout-status` value: 'idle', 'pending' or 'ended'. */
  logoutStatus: string;
  /** Current-user query data: undefined before the first answer, null when signed out (401 or logout). */
  data: unknown;
  /** Current-user query error: set once the latest fetch failed after its retries, cleared by a success. */
  error: unknown;
  /** Whether a current-user request (or one of its retries) is in flight. */
  isFetching: boolean;
  /** Whether that request waits for the offline browser to come back online. TanStack clears `error` meanwhile. */
  isPaused: boolean;
  /** Whether an earlier current-user request failed. TanStack clears `error` while a query without data refetches. */
  hasFailedBefore: boolean;
}

/**
 * Turns the shared current-user query state into the app's sign-in status. Only a 401 means "signed out";
 * any other failure of the current-user request is an error the user can retry, never a sign-out.
 */
export function deriveAuthStatus({
  isInitialized,
  logoutStatus,
  data,
  error,
  isFetching,
  isPaused,
  hasFailedBefore,
}: AuthStatusInput): AuthStatus {
  // Logout wins: once either logout action starts, late identity answers no longer count.
  if (logoutStatus !== 'idle') return 'unauthenticated';
  if (!isInitialized) return 'loading';
  // A failed background refetch keeps the cached user signed in.
  if (data) return 'authenticated';
  if (error) return isUnauthenticatedError(error) ? 'unauthenticated' : 'error';
  // `null` means signed out (a 401, or set by logout); a sign-in reloading the user keeps the login form.
  if (data === null) return 'unauthenticated';
  // Offline: the request waits for the network, so offer Retry instead of booting indefinitely.
  if (isPaused) return 'error';
  // Retrying after a failure: keep the error screen (its Retry button shows the request) instead of booting again.
  if (isFetching && hasFailedBefore) return 'error';
  // No answer yet: the first request, or one of its retries, is still running.
  return 'loading';
}
