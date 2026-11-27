import { ReactNode, useMemo } from 'react';
import type { ResourceFlowLog } from '@attraccess/react-query-client';
import { useLiveLogs } from '../liveLogs';
import type { FlowOwner } from '../flowOwner';
import { useFlowLogKeepAlive } from '../useFlowLogKeepAlive';
import { FlowLogsContext, type FlowLogsContextType } from './flowLogsContext';

interface FlowLogsProviderProps {
  owner: FlowOwner;
  /** Receives every live entry as it arrives, for the canvas node activity and run feedback. */
  onLog: (log: ResourceFlowLog) => void;
  children: ReactNode;
}

/** Records flow logs while the editor is in use and provides the live entries to the log viewer. */
export function FlowLogsProvider({ owner, onLog, children }: Readonly<FlowLogsProviderProps>) {
  const { liveLogs } = useLiveLogs({ owner, onUpdate: onLog });
  const { isPausedForInactivity } = useFlowLogKeepAlive(owner);

  const value = useMemo<FlowLogsContextType>(
    () => ({ liveLogs, isPausedForInactivity }),
    [liveLogs, isPausedForInactivity],
  );

  return <FlowLogsContext.Provider value={value}>{children}</FlowLogsContext.Provider>;
}
