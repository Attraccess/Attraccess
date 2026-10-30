import { ApiError } from '@attraccess/react-query-client';

/** Whether an API call was refused with 403 Forbidden. */
export function isForbiddenError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 403;
}
