import { useQueryClient } from '@tanstack/react-query';
import {
  UseResourcesServiceResourceUsageGetActiveSessionKeyFn,
  UseResourcesServiceResourceUsageGetHistoryKeyFn,
} from '@attraccess/react-query-client';
export function useInvalidateSessionHistory(resourceId: number) {
  const queryClient = useQueryClient();
  return () => {
    // Invalidate the active session query to refetch data
    queryClient.invalidateQueries({
      queryKey: UseResourcesServiceResourceUsageGetActiveSessionKeyFn({ resourceId }),
    });
    // Invalidate all history queries for this resource (regardless of pagination/user filters)
    queryClient.invalidateQueries({
      predicate: (query) => {
        const baseHistoryKey = UseResourcesServiceResourceUsageGetHistoryKeyFn({ resourceId });
        return (
          query.queryKey[0] === baseHistoryKey[0] &&
          query.queryKey.length > 1 &&
          JSON.stringify(query.queryKey[1]).includes(`"resourceId":${resourceId}`)
        );
      },
    });
  };
}
