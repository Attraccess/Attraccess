import { QueryClient } from '@tanstack/react-query';
import {
  UseResourceUsageGetActiveSessionKeyFn,
  UseResourceUsageGetHistoryKeyFn,
  useGetProjectUsageHistoryKey,
  useGetProjectUsageStatsKey,
} from '@attraccess/react-query-client';

/** A project change affects the machine's history and what both projects were charged. */
export function invalidateSwitchedRecords(queryClient: QueryClient, resourceId: number) {
  const historyKey = UseResourceUsageGetHistoryKeyFn({ path: { resourceId } })[0];
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: [historyKey] }),
    queryClient.invalidateQueries({ queryKey: [useGetProjectUsageHistoryKey] }),
    queryClient.invalidateQueries({ queryKey: [useGetProjectUsageStatsKey] }),
  ]);
}

/** Everything a project change affects: the running session and its records. */
export function invalidateSwitchedSession(queryClient: QueryClient, resourceId: number) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: UseResourceUsageGetActiveSessionKeyFn({ path: { resourceId } }) }),
    invalidateSwitchedRecords(queryClient, resourceId),
  ]);
}
