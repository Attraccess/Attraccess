import { useCallback } from 'react';
import type { NetworkRestrictedAction } from '@attraccess/application-models';
import { useGetNetworkRestrictionStatus } from '@attraccess/react-query-client';

/**
 * Which restricted resource actions the signed-in user may do from where they are now. The server decides every
 * request; this only lets the controls say so up front. While the answer is not there yet, nothing is restricted.
 */
export function useNetworkRestriction() {
  const { data } = useGetNetworkRestrictionStatus(undefined, undefined, { staleTime: 30_000 });

  const isRestricted = useCallback(
    (action: NetworkRestrictedAction) =>
      data?.enabled === true && !data.allowedFromHere.some((allowed) => String(allowed) === action),
    [data],
  );

  return { isRestricted };
}
