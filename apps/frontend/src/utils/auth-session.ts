import { type QueryClient } from '@tanstack/react-query';
import { UseUsersServiceGetCurrentKeyFn } from '@attraccess/react-query-client';
import { resumeLiveUpdates } from './live-updates';

export async function restoreAuthentication(queryClient: QueryClient): Promise<void> {
  queryClient.setQueryData(['auth-logout-status'], 'idle');
  resumeLiveUpdates();
  await queryClient.invalidateQueries({ queryKey: UseUsersServiceGetCurrentKeyFn() });
}
