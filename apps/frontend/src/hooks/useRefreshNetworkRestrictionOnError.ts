import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useGetNetworkRestrictionStatusKey } from '@attraccess/react-query-client';
import { isNetworkRestrictedError } from '../utils/apiError';

/**
 * Returns a function for mutation error handlers: on a NETWORK_RESTRICTED refusal (the user's network changed since
 * the controls were drawn) it asks for the network status again, so the controls match where the user is now.
 * Returns whether the error was such a refusal.
 */
export function useRefreshNetworkRestrictionOnError() {
  const queryClient = useQueryClient();
  return useCallback(
    (error: unknown): boolean => {
      if (!isNetworkRestrictedError(error)) return false;
      void queryClient.invalidateQueries({ queryKey: [useGetNetworkRestrictionStatusKey] });
      return true;
    },
    [queryClient],
  );
}
