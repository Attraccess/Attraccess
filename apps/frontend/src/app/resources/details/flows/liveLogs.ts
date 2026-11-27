import { useEffect, useRef, useState } from 'react';
import { events } from 'fetch-event-stream';
import { ResourceFlowLog } from '@attraccess/react-query-client';
import { useLiveUpdates } from '../../../../utils/live-updates';
import { getBaseUrl } from '../../../../api';
import { FlowOwner, flowOwnerKey } from './flowOwner';

interface Props {
  owner: FlowOwner;
  onUpdate: (log: ResourceFlowLog) => void;
}

/** Streams the logs of a global flow from its own SSE endpoint; resource flows use the shared live-update stream. */
function useGlobalFlowLogStream(flowId: number | undefined, onLog: (log: ResourceFlowLog) => void) {
  const latest = useRef(onLog);
  latest.current = onLog;

  useEffect(() => {
    if (!flowId) return;
    const abort = new AbortController();
    void (async () => {
      try {
        // eslint-disable-next-line no-restricted-syntax -- Raw SSE response of the global flow log stream.
        const response = await fetch(`${getBaseUrl()}/api/flows/${flowId}/logs/live`, {
          credentials: 'include',
          signal: abort.signal,
        });
        if (!response.ok) return;
        for await (const message of events(response, abort.signal)) {
          try {
            const payload = JSON.parse(message.data as string) as ResourceFlowLog & { keepalive?: boolean };
            if (payload.keepalive) continue;
            latest.current(payload);
          } catch {
            // A malformed frame must not end the stream.
          }
        }
      } catch {
        // Aborted on unmount, or the stream dropped; the log viewer still has the recorded buffer.
      }
    })();
    return () => abort.abort();
  }, [flowId]);
}

/** Newest entries win; matches the server's per-recording buffer. */
export const MAX_LIVE_LOGS = 2000;
/** Incoming entries are applied to React state at most this often. */
export const LIVE_LOG_FLUSH_MS = 100;

/** Appends and keeps only the newest {@link MAX_LIVE_LOGS} entries. */
export function appendCapped<T>(current: readonly T[], added: readonly T[]): T[] {
  const combined = current.length ? [...current, ...added] : [...added];
  return combined.length > MAX_LIVE_LOGS ? combined.slice(combined.length - MAX_LIVE_LOGS) : combined;
}

interface LiveLogState {
  ownerKey: string;
  owner: object | null;
  logs: ResourceFlowLog[];
}

/**
 * Live log entries of the owner's flow. `onUpdate` receives every entry synchronously; the returned list
 * is updated in batches (at most every {@link LIVE_LOG_FLUSH_MS}) and holds the newest {@link MAX_LIVE_LOGS}.
 */
export function useLiveLogs(props: Props) {
  const { owner, onUpdate } = props;
  const ownerKey = flowOwnerKey(owner);
  const [state, setState] = useState<LiveLogState | null>(null);
  const pending = useRef<LiveLogState | null>(null);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const flush = () => {
    flushTimer.current = undefined;
    const batch = pending.current;
    pending.current = null;
    if (!batch?.logs.length) return;
    setState((prev) => ({
      ownerKey: batch.ownerKey,
      owner: batch.owner,
      logs: appendCapped(prev?.ownerKey === batch.ownerKey && prev.owner === batch.owner ? prev.logs : [], batch.logs),
    }));
  };

  const push = (data: ResourceFlowLog, liveOwner: object | null) => {
    const batch = pending.current;
    if (batch && batch.ownerKey === ownerKey && batch.owner === liveOwner) {
      batch.logs.push(data);
      if (batch.logs.length > MAX_LIVE_LOGS) batch.logs.splice(0, batch.logs.length - MAX_LIVE_LOGS);
    } else {
      pending.current = { ownerKey, owner: liveOwner, logs: [data] };
    }
    flushTimer.current ??= setTimeout(flush, LIVE_LOG_FLUSH_MS);
    onUpdate(data);
  };

  useEffect(
    () => () => {
      clearTimeout(flushTimer.current);
      flushTimer.current = undefined;
      pending.current = null;
    },
    [],
  );

  const { abort, owner: client } = useLiveUpdates({
    topic: 'flow-logs',
    resourceId: owner.kind === 'resource' ? owner.resourceId : 0,
    enabled: owner.kind === 'resource',
    onUpdate: (data) => push(data, client),
  });

  useGlobalFlowLogStream(owner.kind === 'global' ? owner.flowId : undefined, (data) => push(data, null));

  // Reset during render so consumers never commit the previous owner's logs.
  // Clearing also prevents an A -> B -> A navigation from reviving old entries.
  const liveOwner = owner.kind === 'resource' ? client : null;
  if (state && (state.ownerKey !== ownerKey || state.owner !== liveOwner)) setState(null);

  return {
    liveLogs: state?.logs ?? EMPTY_LOGS,
    abort,
  };
}

const EMPTY_LOGS: ResourceFlowLog[] = [];
