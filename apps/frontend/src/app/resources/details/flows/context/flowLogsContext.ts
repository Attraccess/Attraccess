// Live log entries change many times a second on a busy flow. They live in their own context so a new
// entry re-renders only the log viewer, never the canvas or other FlowContext consumers.
import { createContext, useContext } from 'react';
import type { ResourceFlowLog } from '@attraccess/react-query-client';

export interface FlowLogsContextType {
  /** Entries received live since the editor opened, oldest first, at most the newest 2000. */
  liveLogs: ResourceFlowLog[];
  /** This page stopped keeping the flow log recording alive because nobody used it. */
  isPausedForInactivity: boolean;
}

export const FlowLogsContext = createContext<FlowLogsContextType | undefined>(undefined);

export function useFlowLogsContext(): FlowLogsContextType {
  const context = useContext(FlowLogsContext);
  if (context === undefined) {
    throw new Error('useFlowLogsContext must be used within a FlowProvider');
  }
  return context;
}
