import { useContext } from 'react';
import type { FlowContextType } from './flowContext.contracts';
import { FlowContext } from './flowContext.flow-context';

export function useFlowContext(): FlowContextType {
  const context = useContext(FlowContext);
  if (context === undefined) {
    throw new Error('useFlowContext must be used within a FlowProvider');
  }
  return context;
}
