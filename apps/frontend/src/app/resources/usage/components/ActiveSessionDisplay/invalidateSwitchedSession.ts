import { QueryClient } from '@tanstack/react-query';
import {
  UseResourceUsageGetActiveSessionKeyFn,
  UseResourceUsageGetHistoryKeyFn,
  useGetProjectUsageHistoryKey,
  useGetProjectUsageStatsKey,
} from '@attraccess/react-query-client';

/** A project switch changes the running session, the machine's history and what both projects were charged. */
export function invalidateSwitchedSession(queryClient: QueryClient, resourceId: number) {
  const historyKey = UseResourceUsageGetHistoryKeyFn({ path: { resourceId } })[0];
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: UseResourceUsageGetActiveSessionKeyFn({ path: { resourceId } }) }),
    queryClient.invalidateQueries({ queryKey: [historyKey] }),
    queryClient.invalidateQueries({ queryKey: [useGetProjectUsageHistoryKey] }),
    queryClient.invalidateQueries({ queryKey: [useGetProjectUsageStatsKey] }),
  ]);
}
