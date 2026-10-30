/** The server's error message of a failed API call, falling back to the transport error. */
export function apiErrorMessage(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined;
  const body = (error as Error & { body?: { message?: string | string[] } }).body;
  const message = body?.message ?? error.message;
  return Array.isArray(message) ? message.join(', ') : message;
}

export const TERMINAL_PAIRING_STATES: readonly string[] = ['completed', 'failed', 'cancelled', 'expired'];

export function isPairingRunning(state: string) {
  return !TERMINAL_PAIRING_STATES.includes(state);
}

/** Readers with a running pairing that is bound or targeted to their record. */
export function readerIdsWaitingToPair(
  pairings: ReadonlyArray<{ state: string; boundReaderId: number | null; targetReaderId: number | null }> | undefined,
): Set<number> {
  const ids = new Set<number>();
  for (const pairing of pairings ?? []) {
    if (!isPairingRunning(pairing.state)) continue;
    if (pairing.boundReaderId !== null) ids.add(pairing.boundReaderId);
    if (pairing.targetReaderId !== null) ids.add(pairing.targetReaderId);
  }
  return ids;
}

export type PairingErrorKind =
  'wrongCode' | 'codeNotFound' | 'ambiguous' | 'stale' | 'notWaiting' | 'rateLimited' | 'unknown';

export interface PairingError {
  kind: PairingErrorKind;
  /** Only for rateLimited, when the server tells how long to wait. */
  retryAfterSeconds?: number;
  message?: string;
}

/** Sorts a failed pairing call into the cases the dialog explains; everything else keeps the server message. */
export function classifyPairingError(error: unknown, whileResolving = false): PairingError {
  const status = (error as { status?: number } | null)?.status;
  const body = (error as { body?: { message?: unknown; retryAfterSeconds?: unknown } } | null)?.body;
  const message = typeof body?.message === 'string' ? body.message : undefined;
  if (status === 429) {
    const retry = body?.retryAfterSeconds;
    return { kind: 'rateLimited', retryAfterSeconds: typeof retry === 'number' ? Math.ceil(retry) : undefined };
  }
  if (status === 404 && message === 'PairingCodeNotFound')
    return { kind: whileResolving ? 'codeNotFound' : 'wrongCode' };
  if (status === 409 && message === 'PairingCodeAmbiguous') return { kind: 'ambiguous' };
  if (status === 409 && message === 'PairingRoundStale') return { kind: 'stale' };
  if (status === 409 || status === 404) return { kind: 'notWaiting' };
  return { kind: 'unknown', message: apiErrorMessage(error) };
}
