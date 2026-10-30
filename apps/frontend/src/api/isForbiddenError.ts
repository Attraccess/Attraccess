/**
 * A 403 on a status read means the instance only shows activity for introduced equipment ("introduced only"
 * visibility). It is an answer, not a failure: callers hide the status instead of showing an error.
 */
export function isForbiddenError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { status?: unknown }).status === 403;
}
