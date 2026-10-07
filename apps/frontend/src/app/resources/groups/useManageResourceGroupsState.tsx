import type { ManageResourceGroupsProps } from './index';
import { useManageResourceGroupsStateInputs } from './useManageResourceGroupsStateInputs';
import { useManageResourceGroupsStateRenderTable } from './useManageResourceGroupsStateRenderTable';
import { useManageResourceGroupsStateContent } from './useManageResourceGroupsStateContent';

export function useManageResourceGroupsState({ resourceId, hideHeader, ...rest }: Readonly<ManageResourceGroupsProps>) {
  const useManageResourceGroupsStateInputsModel = useManageResourceGroupsStateInputs({
    resourceId,
    hideHeader,
    ...rest,
  });
  const useManageResourceGroupsStateRenderTableModel = useManageResourceGroupsStateRenderTable(
    useManageResourceGroupsStateInputsModel,
  );
  return useManageResourceGroupsStateContent(useManageResourceGroupsStateRenderTableModel);
}
