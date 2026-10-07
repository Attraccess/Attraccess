import { FlowProviderProps } from './flowContext.contracts';
import { useFlowProviderStateInputs } from './useFlowProviderStateInputs';
import { useFlowProviderStateOutput } from './useFlowProviderStateOutput';

export function useFlowProviderState({ children, resourceId }: FlowProviderProps) {
  const useFlowProviderStateInputsModel = useFlowProviderStateInputs({ children, resourceId });
  return useFlowProviderStateOutput(useFlowProviderStateInputsModel);
}
