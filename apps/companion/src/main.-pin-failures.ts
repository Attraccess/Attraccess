export // ─── PIN rate limiting ────────────────────────────────────────────────────────
// ponytail: simple exponential backoff; resets on success. Doubles up to 30s.

let _pinFailures = 0;

export let _pinBackoffUntil = 0;

export function recordPinFailure(): void {
  _pinFailures++;
  const backoffMs = Math.min(1000 * 2 ** (_pinFailures - 1), 30_000);
  _pinBackoffUntil = Date.now() + backoffMs;
}

export function recordPinSuccess(): void {
  _pinFailures = 0;
  _pinBackoffUntil = 0;
}
