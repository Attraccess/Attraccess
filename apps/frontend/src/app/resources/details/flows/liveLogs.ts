import { ResourceFlowLog } from '@attraccess/react-query-client';
import { useSSE } from '../../../../utils/sse';
import { useState } from 'react';

interface Props {
  resourceId: number;
  onUpdate: (log: ResourceFlowLog) => void;
}

export function useLiveLogs(props: Props) {
  const { resourceId, onUpdate } = props;
  const [liveLogs, setLiveLogs] = useState<ResourceFlowLog[]>([]);

  const { abort } = useSSE<ResourceFlowLog>({
    path: `/api/resources/${resourceId}/flow/logs/live`,
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
