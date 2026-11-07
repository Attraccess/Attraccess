import type { UseQueryResult } from '@tanstack/react-query';

/** Loading, error and retry props for `ReservationsTable`; a retry shows the spinner again, not the empty state. */
export function listState(query: Pick<UseQueryResult, 'isPending' | 'isError' | 'isFetching' | 'error' | 'refetch'>) {
  return {
    isPending: query.isPending || (query.isError && query.isFetching),
    error: query.isError && !query.isFetching ? query.error : undefined,
    onRetry: () => void query.refetch(),
  };
}
