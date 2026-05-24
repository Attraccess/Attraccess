import { HTMLAttributes, useCallback, useMemo, useState } from 'react';
import {
  ResourceGroup,
  useResourcesServiceGetAllResourcesKey,
  useResourcesServiceGetOneResourceById,
  UseResourcesServiceGetOneResourceByIdKeyFn,
  useResourcesServiceResourceGroupsAddResource,
  useResourcesServiceResourceGroupsGetMany,
  useResourcesServiceResourceGroupsRemoveResource,
} from '@attraccess/react-query-client';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { GroupIcon } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import en from './en.json';
import de from './de.json';
import { EmptyState } from '../../../components/emptyState';
import { FlatSection } from '../../../components/flatSection';
import { useToastMessage } from '../../../components/toastProvider';
import { ResourceGroupUpsertModal } from '../../resource-groups/upsertModal/resourceGroupUpsertModal';
import { GroupsToolbar } from './GroupsToolbar';
import { ResourceGroupRow } from './ResourceGroupRow';
import { filterAndSortGroups, GroupFilter } from './groupsFilter';

type ManageResourceGroupsProps = Omit<HTMLAttributes<HTMLElement>, 'children'> & {
  resourceId: number;
  hideHeader?: boolean;
};

export function ManageResourceGroups({
  resourceId,
  hideHeader,
  ...rest
}: Readonly<ManageResourceGroupsProps>) {
  const { t } = useTranslations({ de, en });
  const queryClient = useQueryClient();
  const toast = useToastMessage();

  const { data: resource } = useResourcesServiceGetOneResourceById({ id: resourceId });
  const { data: groups } = useResourcesServiceResourceGroupsGetMany();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<GroupFilter>('all');
  const [pendingGroupIds, setPendingGroupIds] = useState<ReadonlySet<number>>(new Set());

  const assignedIds = useMemo<ReadonlySet<number>>(
    () => new Set(resource?.groups?.map((g) => g.id) ?? []),
    [resource?.groups],
  );

  const allGroups = useMemo(() => groups ?? [], [groups]);

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [useResourcesServiceGetAllResourcesKey] });
    queryClient.invalidateQueries({
      queryKey: UseResourcesServiceGetOneResourceByIdKeyFn({ id: resourceId }),
    });
  }, [queryClient, resourceId]);

  const markPending = useCallback((groupId: number, on: boolean) => {
    setPendingGroupIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(groupId);
      else next.delete(groupId);
      return next;
    });
  }, []);

  const { mutateAsync: addResourceToGroup } = useResourcesServiceResourceGroupsAddResource();
  const { mutateAsync: removeResourceFromGroup } = useResourcesServiceResourceGroupsRemoveResource();

  const handleToggle = useCallback(
    async (group: ResourceGroup) => {
      const wasAssigned = assignedIds.has(group.id);
      markPending(group.id, true);
      try {
        if (wasAssigned) {
          await removeResourceFromGroup({ groupId: group.id, resourceId });
        } else {
          await addResourceToGroup({ groupId: group.id, resourceId });
        }
        invalidateAll();
      } catch {
        toast.error({ title: t('errors.toggleFailed') });
      } finally {
        markPending(group.id, false);
      }
    },
    [addResourceToGroup, removeResourceFromGroup, assignedIds, invalidateAll, markPending, resourceId, toast, t],
  );

  const onGroupCreated = useCallback(
    (group: ResourceGroup) => {
      handleToggle(group);
    },
    [handleToggle],
  );

  const visibleGroups = useMemo(
    () => filterAndSortGroups({ groups: allGroups, assignedIds, search, filter }),
    [allGroups, assignedIds, search, filter],
  );

  const counts = useMemo(() => {
    let assigned = 0;
    for (const g of allGroups) if (assignedIds.has(g.id)) assigned += 1;
    return { assigned, available: allGroups.length - assigned };
  }, [allGroups, assignedIds]);

  const resourceName = resource?.name ?? '';

  const renderBody = () => {
    if (allGroups.length === 0) {
      return <EmptyState message={t('empty.noGroups')} />;
    }
    if (visibleGroups.length === 0) {
      return <EmptyState message={t('empty.noMatch')} />;
    }
    return (
      <ul className="flex flex-col gap-1" data-cy="resource-groups-list">
        {visibleGroups.map((group) => {
          const isAssigned = assignedIds.has(group.id);
          return (
            <ResourceGroupRow
              key={group.id}
              groupId={group.id}
              groupName={group.name}
              description={group.description}
              isAssigned={isAssigned}
              isPending={pendingGroupIds.has(group.id)}
              toggleLabel={t(isAssigned ? 'row.toggleOff' : 'row.toggleOn', {
                resource: resourceName,
                group: group.name,
              })}
              openLabel={t('row.openGroup')}
              openHref={`/resource-groups/${group.id}`}
              onToggle={() => handleToggle(group)}
            />
          );
        })}
      </ul>
    );
  };

  const renderToolbar = (onNewGroup: () => void) => (
    <GroupsToolbar
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder={t('search.placeholder')}
      filter={filter}
      onFilterChange={setFilter}
      filterLabels={{
        all: t('filter.all'),
        assigned: t('filter.assigned'),
        available: t('filter.available'),
      }}
      assignedCount={counts.assigned}
      availableCount={counts.available}
      newGroupLabel={t('newGroup')}
      onNewGroup={onNewGroup}
    />
  );

  const content = (
    <ResourceGroupUpsertModal onUpserted={onGroupCreated}>
      {(onOpen: () => void) => (
        <>
          {renderToolbar(onOpen)}
          {renderBody()}
        </>
      )}
    </ResourceGroupUpsertModal>
  );

  if (hideHeader) {
    return <section {...rest}>{content}</section>;
  }

  return (
    <FlatSection icon={<GroupIcon className="w-4 h-4" />} title={t('title')} {...rest}>
      {content}
    </FlatSection>
  );
}
