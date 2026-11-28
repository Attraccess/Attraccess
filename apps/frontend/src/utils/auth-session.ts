import { type QueryClient } from '@tanstack/react-query';
import { UseGetCurrentKeyFn } from '@attraccess/react-query-client';
import { resumeLiveUpdates } from './live-updates';

/** Set while the user reload after a sign-in runs: its failure is reported, not read as "still signed out". */
export const SIGN_IN_RELOAD_KEY = ['auth-sign-in-reload'] as const;

export async function restoreAuthentication(queryClient: QueryClient): Promise<void> {
  queryClient.setQueryData(['auth-logout-status'], 'idle');
  resumeLiveUpdates();
  queryClient.setQueryData(SIGN_IN_RELOAD_KEY, true);
  try {
    await queryClient.invalidateQueries({ queryKey: UseGetCurrentKeyFn() });
  } finally {
    queryClient.setQueryData(SIGN_IN_RELOAD_KEY, false);
  }
}
