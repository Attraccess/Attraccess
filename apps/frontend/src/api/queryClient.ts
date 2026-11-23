import { QueryClient } from '@tanstack/react-query';
import { shouldRetryQuery } from './retryRules';

export { DEFAULT_RETRIES } from './retryRules';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: shouldRetryQuery,
    },
  },
});
