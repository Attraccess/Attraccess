import { QueryClient } from '@tanstack/react-query';
import { isForbiddenError } from './isForbiddenError';

const DEFAULT_RETRIES = 3;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      // Asking again does not change a 403, so do not delay the answer with retries.
      retry: (failureCount, error) => !isForbiddenError(error) && failureCount < DEFAULT_RETRIES,
    },
  },
});
