import type { LiveLogReceiver } from './flowContext.contracts';
import { FlowContext } from './flowContext.flow-context';
import { FlowProviderProps } from './flowContext.contracts';
import { useFlowContext } from './flowContext.use-flow-context';
import { useFlowProviderState } from './useFlowProviderState';

export function FlowProvider({ children, resourceId }: FlowProviderProps) {
  const { value } = useFlowProviderState({ children, resourceId });

  return <FlowContext.Provider value={value}>{children}</FlowContext.Provider>;
}

export { type LiveLogReceiver };
export { useFlowContext };
