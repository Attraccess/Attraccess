import { ApiError } from '@attraccess/react-query-client';

/** Whether an API call was answered with 404 Not Found. */
export function isNotFoundError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}
