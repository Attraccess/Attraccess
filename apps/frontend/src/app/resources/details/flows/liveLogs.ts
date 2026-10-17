import { ResourceFlowLog } from '@attraccess/react-query-client';
import { useLiveUpdates } from '../../../../utils/live-updates';
import { useState } from 'react';

interface Props {
  resourceId: number;
  onUpdate: (log: ResourceFlowLog) => void;
}

export function useLiveLogs(props: Props) {
  const { resourceId, onUpdate } = props;
  const [state, setState] = useState<{
    resourceId: number;
    owner: object | null;
    logs: ResourceFlowLog[];
  } | null>(null);

  const { abort, owner } = useLiveUpdates({
    topic: 'flow-logs',
    resourceId,
    onUpdate: (data) => {
      setState((prev) => ({
        resourceId,
        owner,
        logs: [...(prev?.resourceId === resourceId && prev.owner === owner ? prev.logs : []), data],
      }));
      onUpdate(data);
    },
  });

  // Reset during render so consumers never commit the previous owner's logs.
  // Clearing also prevents an A -> B -> A navigation from reviving old entries.
  if (state && (state.resourceId !== resourceId || state.owner !== owner)) setState(null);

  return {
    liveLogs: state?.logs ?? [],
    abort,
  };
}
