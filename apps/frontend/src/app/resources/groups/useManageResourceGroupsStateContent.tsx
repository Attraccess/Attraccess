import { ResourceGroupUpsertModal } from '../../resource-groups/upsertModal/resourceGroupUpsertModal';
import type { useManageResourceGroupsStateRenderTable } from './useManageResourceGroupsStateRenderTable';

export function useManageResourceGroupsStateContent(model: ReturnType<typeof useManageResourceGroupsStateRenderTable>) {
  const content = (
    <ResourceGroupUpsertModal onUpserted={model.onGroupCreated}>
      {(onOpen: () => void) => (
        <>
          {model.renderToolbar(onOpen)}
          {model.renderTable()}
        </>
      )}
    </ResourceGroupUpsertModal>
  );
  return { t: model.t, content, hideHeader: model.hideHeader, rest: model.rest } as const;
}
