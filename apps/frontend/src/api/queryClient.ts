import { QueryClient } from '@tanstack/react-query';
import { isForbiddenError } from './isForbiddenError';
import { isNotFoundError } from './isNotFoundError';

export const DEFAULT_RETRIES = 3;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      // A 403 or 404 is a decision, not a transient failure: asking again does not change it, so answer at once
      // instead of after the retries (a machine hidden from the viewer answers 404, ATT-843). Everything else
      // keeps TanStack Query's default of three retries.
      retry: (failureCount, error) =>
        !isForbiddenError(error) && !isNotFoundError(error) && failureCount < DEFAULT_RETRIES,
    },
  },
});
