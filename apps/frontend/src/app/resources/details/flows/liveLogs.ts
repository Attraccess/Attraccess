import { ResourceFlowLog } from '@attraccess/react-query-client';
import { useLiveUpdates } from '../../../../utils/live-updates';
import { useState } from 'react';

interface Props {
  resourceId: number;
  onUpdate: (log: ResourceFlowLog) => void;
}

export function useLiveLogs(props: Props) {
  const { resourceId, onUpdate } = props;
  const [liveLogs, setLiveLogs] = useState<ResourceFlowLog[]>([]);

  const { abort } = useLiveUpdates({
    topic: 'flow-logs',
    resourceId,
    onUpdate: (data) => {
      setLiveLogs((prev) => [...prev, data]);
      onUpdate(data);
    },
  });

  return {
    liveLogs,
    abort,
  };
}
