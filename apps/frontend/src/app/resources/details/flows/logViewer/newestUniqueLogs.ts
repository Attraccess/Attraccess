import type { ResourceFlowLog } from '@attraccess/react-query-client';
import { MAX_LIVE_LOGS } from '../liveLogs';

/** Unique by id, oldest first, at most the newest {@link MAX_LIVE_LOGS}. */
export function newestUniqueLogs(logs: ResourceFlowLog[]): ResourceFlowLog[] {
  const unique = [...new Map(logs.map((log) => [log.id, log])).values()].sort((a, b) => a.id - b.id);
  return unique.length > MAX_LIVE_LOGS ? unique.slice(unique.length - MAX_LIVE_LOGS) : unique;
}
