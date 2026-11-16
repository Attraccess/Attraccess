import type { UseQueryResult } from '@tanstack/react-query';

/**
 * Loading, error and retry props for `ReservationsTable`; a retry shows the spinner again, not the
 * empty state. Pass the plugin timezone so the list waits for it instead of formatting in another zone.
 */
export function listState(
  query: Pick<UseQueryResult, 'isPending' | 'isError' | 'isFetching' | 'error' | 'refetch'>,
  timezone?: string | null,
) {
  return {
    isPending: query.isPending || (query.isError && query.isFetching) || timezone === null,
    error: query.isError && !query.isFetching ? query.error : undefined,
    onRetry: () => void query.refetch(),
  };
}
