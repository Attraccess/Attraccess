import type { StartSessionControlsProps } from './index';
import { useStartSessionControlsStateInputs } from './useStartSessionControlsStateInputs';
import { useStartSessionControlsStateStartUsageSessionMutate } from './useStartSessionControlsStateStartUsageSessionMutate';
import { useStartSessionControlsStateOutput } from './useStartSessionControlsStateOutput';

export function useStartSessionControlsState(
  props: Readonly<StartSessionControlsProps> & React.HTMLAttributes<HTMLDivElement>,
) {
  const useStartSessionControlsStateInputsModel = useStartSessionControlsStateInputs(props);
  const useStartSessionControlsStateStartUsageSessionMutateModel = useStartSessionControlsStateStartUsageSessionMutate(
    useStartSessionControlsStateInputsModel,
  );
  return useStartSessionControlsStateOutput(useStartSessionControlsStateStartUsageSessionMutateModel);
}
