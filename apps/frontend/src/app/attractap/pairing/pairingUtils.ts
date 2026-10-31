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
  | 'wrongCode'
  | 'codeNotFound'
  | 'ambiguous'
  | 'stale'
  | 'notWaiting'
  | 'failed'
  | 'readerGone'
  | 'keyInUse'
  | 'targetNotFound'
  | 'targetMissing'
  | 'wrongMode'
  | 'rateLimited'
  | 'unknown';

export interface PairingError {
  kind: PairingErrorKind;
  /** Only for rateLimited, when the server tells how long to wait. */
  retryAfterSeconds?: number;
  message?: string;
}

const CONFLICTS: Record<string, PairingErrorKind> = {
  PairingCodeAmbiguous: 'ambiguous',
  PairingRoundStale: 'stale',
  PairingFailed: 'failed',
  PairingReaderGone: 'readerGone',
  PairingKeyInUse: 'keyInUse',
};

const NOT_FOUND: Record<string, PairingErrorKind> = {
  'Reader not found': 'targetNotFound',
};

// The server's wording for a mode that does not fit the reader; the dialog says it in plain words.
const BAD_REQUESTS: Record<string, PairingErrorKind> = {
  'targetReaderId is required': 'targetMissing',
  'This reader already has a record; use pair': 'wrongMode',
  'Only readers signed in with a token can be paired': 'wrongMode',
  'This reader is bound to a different record': 'wrongMode',
};

const KNOWN_BY_STATUS: Record<number, Record<string, PairingErrorKind>> = {
  400: BAD_REQUESTS,
  404: NOT_FOUND,
  409: CONFLICTS,
};

function codeNotFound(whileResolving: boolean): PairingError {
  return { kind: whileResolving ? 'codeNotFound' : 'wrongCode' };
}

function rateLimited(retry: unknown): PairingError {
  return { kind: 'rateLimited', retryAfterSeconds: typeof retry === 'number' ? Math.ceil(retry) : undefined };
}

/** Sorts a failed pairing call into the cases the dialog explains; everything else keeps the server message. */
export function classifyPairingError(error: unknown, whileResolving = false): PairingError {
  const status = (error as { status?: number } | null)?.status;
  const body = (error as { body?: { message?: unknown; retryAfterSeconds?: unknown } } | null)?.body;
  const message = typeof body?.message === 'string' ? body.message : '';
  if (status === 429) return rateLimited(body?.retryAfterSeconds);
  if (status === 404 && message === 'PairingCodeNotFound') return codeNotFound(whileResolving);
  const known = KNOWN_BY_STATUS[status ?? 0]?.[message];
  if (known) return { kind: known };
  // Any other 404 or 409: the request is gone or no longer waits (PairingNotWaiting, Pairing not found).
  if (status === 409 || status === 404) return { kind: 'notWaiting' };
  return { kind: 'unknown', message: apiErrorMessage(error) };
}
