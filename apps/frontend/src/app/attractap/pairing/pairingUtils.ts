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
