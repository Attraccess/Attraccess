import { useFlowsPageInnerStateInputs } from './useFlowsPageInnerStateInputs';
import { useFlowsPageInnerStateNodesHaveChanged } from './useFlowsPageInnerStateNodesHaveChanged';
import { useFlowsPageInnerStateOnDropNode } from './useFlowsPageInnerStateOnDropNode';
import { useFlowsPageInnerStateOutput } from './useFlowsPageInnerStateOutput';
import '@xyflow/react/dist/style.css';

export function useFlowsPageInnerState() {
  const useFlowsPageInnerStateInputsModel = useFlowsPageInnerStateInputs();
  const useFlowsPageInnerStateNodesHaveChangedModel = useFlowsPageInnerStateNodesHaveChanged(
    useFlowsPageInnerStateInputsModel,
  );
  const useFlowsPageInnerStateOnDropNodeModel = useFlowsPageInnerStateOnDropNode(
    useFlowsPageInnerStateNodesHaveChangedModel,
  );
  return useFlowsPageInnerStateOutput(useFlowsPageInnerStateOnDropNodeModel);
}
