import { apiErrorMessage } from '../pairing/pairingUtils';

/**
 * The text for a refused conversion request: the server's blocker codes in the UI language when it names them
 * (a 409 from a gate), otherwise the server's message.
 */
export function conversionErrorText(error: unknown, t: (key: string) => string): string | undefined {
  const blockers = (error as { body?: { blockers?: unknown } } | null)?.body?.blockers;
  if (Array.isArray(blockers) && blockers.length > 0) {
    return blockers.map((blocker) => t(`blocker.${String(blocker)}`)).join(' ');
  }
  return apiErrorMessage(error);
}
