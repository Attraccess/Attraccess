export const BACKOFF_BASE_MS = 1_000;
export const BACKOFF_CAP_MS = 60_000;
export const STABLE_AFTER_MS = 30_000;
const MINIMUM_DELAY_MS = 50;

/** Exponential backoff with full jitter: a random delay between 0 and min(cap, base * 2^attempt). */
export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const ceiling = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** Math.min(attempt, 16));
  return Math.max(MINIMUM_DELAY_MS, Math.floor(random() * ceiling));
}
