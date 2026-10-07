import { useSecuritySectionStateInputs } from './useSecuritySectionStateInputs';
import { useSecuritySectionStateOutput } from './useSecuritySectionStateOutput';

export function useSecuritySectionState() {
  const useSecuritySectionStateInputsModel = useSecuritySectionStateInputs();
  return useSecuritySectionStateOutput(useSecuritySectionStateInputsModel);
}
