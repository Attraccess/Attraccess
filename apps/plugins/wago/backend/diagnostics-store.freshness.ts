import { sourceTime } from './diagnostics-envelope';
import { CONTROLLER_CLOCK_TOLERANCE_MS } from '../shared/clock';

export function freshness(timestamp: string | null | undefined, now = Date.now(), maxAge = 90_000): Freshness {
  if (!timestamp) return 'missing';
  const time = sourceTime(timestamp);
  if (time === null) return 'invalid';
  if (time > now + CONTROLLER_CLOCK_TOLERANCE_MS) return 'future';
  return now - time > maxAge ? 'stale' : 'fresh';
}
export type Freshness = 'missing' | 'invalid' | 'future' | 'stale' | 'fresh';
