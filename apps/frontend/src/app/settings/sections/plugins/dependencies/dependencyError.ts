/** Extracts a displayable message from an API error, preferring the server's response message. */
export function dependencyError(error: unknown): string | null {
  if (!error) return null;
  const body = (error as { body?: { message?: unknown } }).body;
  return typeof body?.message === 'string' ? body.message : error instanceof Error ? error.message : String(error);
}
