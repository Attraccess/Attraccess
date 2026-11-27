type Translate = (key: string, params?: Record<string, string | number>) => string;

interface RefusalBody {
  message?: string | string[];
  blockers?: unknown;
}

/**
 * The server's refusals without a code, by HTTP status and the start of its (English) message, with the key that
 * says the same in the UI language. Messages from `secure-conversion.service.ts`.
 */
const KNOWN_REFUSALS: ReadonlyArray<{ status: number; message: string; key: string }> = [
  { status: 400, message: 'The typed name does not match', key: 'start.nameMismatch' },
  { status: 404, message: 'Reader not found', key: 'error.readerNotFound' },
  { status: 409, message: 'The recovery key check has not passed', key: 'blocker.recovery-check-missing' },
  { status: 409, message: 'The reader did not answer the preflight in time', key: 'error.preflightTimeout' },
  { status: 409, message: 'No signing key for this reader', key: 'noSigningKey' },
  { status: 409, message: 'Another conversion is running', key: 'blocker.conversion-running' },
  { status: 409, message: 'This conversion can no longer be cancelled', key: 'error.cannotCancel' },
  { status: 409, message: 'This conversion cannot be retried', key: 'error.cannotRetry' },
  { status: 409, message: 'This reader cannot be secured now', key: 'error.cannotSecureNow' },
];

/**
 * The text for a refused conversion request, always in the UI language: the server's blocker codes when it names
 * them (a 409 from a gate), a known refusal by status and message, otherwise a generic error with the HTTP status.
 */
export function conversionErrorText(error: unknown, t: Translate): string | undefined {
  if (!error) return undefined;
  const { status, body } = error as { status?: unknown; body?: RefusalBody };
  const blockers = body?.blockers;
  if (Array.isArray(blockers) && blockers.length > 0) {
    return blockers.map((blocker) => t(`blocker.${String(blocker)}`)).join(' ');
  }
  const message = [body?.message ?? []].flat().join(' ');
  const known = KNOWN_REFUSALS.find((refusal) => refusal.status === status && message.startsWith(refusal.message));
  if (known) return t(known.key);
  return typeof status === 'number' ? t('error.genericStatus', { status }) : t('error.generic');
}
