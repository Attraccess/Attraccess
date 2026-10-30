import { QueryClient } from '@tanstack/react-query';
import { isForbiddenError } from './isForbiddenError';

export const DEFAULT_RETRIES = 3;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      // A 403 is a decision, not a transient failure: asking again does not change it, so answer at once
      // instead of after the retries. Everything else keeps TanStack Query's default of three retries.
      retry: (failureCount, error) => !isForbiddenError(error) && failureCount < DEFAULT_RETRIES,
    },
  },
});
