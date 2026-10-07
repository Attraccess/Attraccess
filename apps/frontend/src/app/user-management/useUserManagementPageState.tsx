import { useUserManagementPageStateInputs } from './useUserManagementPageStateInputs';
import { useUserManagementPageStateOutput } from './useUserManagementPageStateOutput';

export function useUserManagementPageState() {
  const useUserManagementPageStateInputsModel = useUserManagementPageStateInputs();
  return useUserManagementPageStateOutput(useUserManagementPageStateInputsModel);
}
