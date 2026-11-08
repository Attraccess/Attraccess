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

export function useLiveLogs(props: Props) {
  const { owner, onUpdate } = props;
  const ownerKey = flowOwnerKey(owner);
  const [state, setState] = useState<{
    ownerKey: string;
    owner: object | null;
    logs: ResourceFlowLog[];
  } | null>(null);

  const push = (data: ResourceFlowLog, liveOwner: object | null) => {
    setState((prev) => ({
      ownerKey,
      owner: liveOwner,
      logs: [...(prev?.ownerKey === ownerKey && prev.owner === liveOwner ? prev.logs : []), data],
    }));
    onUpdate(data);
  };

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
    liveLogs: state?.logs ?? [],
    abort,
  };
}
