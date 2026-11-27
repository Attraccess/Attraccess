import type Redis from 'ioredis';
import { isValkeyUnavailableError, valkeyUnavailableException } from '../valkey/valkey-unavailable';

/** A Valkey call that takes longer counts as failed, so a stalled Valkey never holds a request or a reader. */
export const CLUSTER_COMMAND_TIMEOUT_MS = 2_000;

const OFFLINE = new Set(['reconnecting', 'close', 'end']);

/**
 * Runs one Valkey command, failing at once while the client reconnects (it would only queue the command) and after
 * {@link CLUSTER_COMMAND_TIMEOUT_MS}. Both failures are recognised by `isValkeyUnavailableError`.
 */
export function valkeyCall<T>(
  client: Pick<Redis, 'status'>,
  command: () => Promise<T>,
  timeoutMs = CLUSTER_COMMAND_TIMEOUT_MS,
): Promise<T> {
  const { status } = client;
  if (status && OFFLINE.has(status)) return Promise.reject(new Error(`Valkey is ${status}`));
  let timer: NodeJS.Timeout | undefined;
  return Promise.race([
    command(),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Valkey did not answer in time')), timeoutMs);
      timer.unref?.();
    }),
  ]).finally(() => clearTimeout(timer));
}

/** Maps an unreachable Valkey to the 503 the API answers (rate-limited warning); other errors pass through. */
export function rethrowValkeyUnavailable(error: unknown): never {
  if (isValkeyUnavailableError(error)) throw valkeyUnavailableException(error as Error);
  throw error;
}

/** Awaits `work`, answering 503 when it failed because Valkey could not be reached. */
export async function orServiceUnavailable<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (error) {
    return rethrowValkeyUnavailable(error);
  }
}
