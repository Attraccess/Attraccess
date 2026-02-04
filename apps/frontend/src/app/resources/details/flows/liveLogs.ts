import { ResourceFlowLog } from '@attraccess/react-query-client';
import { useSSE } from '../../../../utils/sse';
import { useState } from 'react';

interface Props {
  resourceId: number;
  onUpdate: (log: ResourceFlowLog) => void;
  enabled?: boolean;
}

export function useLiveLogs(props: Props) {
  const { resourceId, onUpdate, enabled = true } = props;
  const [liveLogs, setLiveLogs] = useState<ResourceFlowLog[]>([]);

  const { abort } = useSSE<ResourceFlowLog>({
    path: `/api/resources/${resourceId}/flow/logs/live`,
    onUpdate: (data) => {
      setLiveLogs((prev) => [...prev, data]);
      onUpdate(data);
    },
    enabled,
  });

  return {
    liveLogs,
    abort,
  };
}
