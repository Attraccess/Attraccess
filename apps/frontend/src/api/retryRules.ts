import { isForbiddenError } from './isForbiddenError';
import { isNotFoundError } from './isNotFoundError';
import { isUnauthenticatedError } from './isUnauthenticatedError';

export const DEFAULT_RETRIES = 3;

/**
 * The app-wide retry rule. A 403 or 404 is a decision, not a transient failure: asking again does not change it,
 * so answer at once instead of after the retries (a machine hidden from the viewer answers 404, ATT-843).
 * Everything else keeps TanStack Query's default of three retries.
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  return !isForbiddenError(error) && !isNotFoundError(error) && failureCount < DEFAULT_RETRIES;
}

/**
 * The retry rule for the current-user query: a 401 means "signed out" and is final, so it is not retried.
 * Other failures (5xx, network errors) are transient and follow the app-wide rule.
 */
export function shouldRetryCurrentUser(failureCount: number, error: unknown): boolean {
  return !isUnauthenticatedError(error) && shouldRetryQuery(failureCount, error);
}
