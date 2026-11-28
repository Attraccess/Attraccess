import { ApiError } from '@attraccess/react-query-client';

/** Whether an API call was refused with 401 Unauthorized, the only answer that means "not signed in". */
export function isUnauthenticatedError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}
