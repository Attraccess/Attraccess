import { HTMLAttributes, useCallback, useMemo, useState } from 'react';
import { GroupIcon, ChevronRightIcon, MinusIcon, PlusIcon } from 'lucide-react';
import { FlatSection } from '../../../components/flatSection';
import { ResourceGroupUpsertModal } from '../../resource-groups/upsertModal/resourceGroupUpsertModal';
import {
  Link,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  TableScrollContainer,
} from '@heroui/react';
import { Button } from '../../../components/button/index';
import { EmptyState } from '../../../components/emptyState';
import { GroupsToolbar } from './GroupsToolbar';
import {
  UseAccessControlServiceResourceIntroductionsGetPeopleKeyFn,
  Resource,
  ResourceGroup,
  useResourcesServiceGetAllResourcesKey,
  useResourcesServiceGetOneResourceById,
  UseResourcesServiceGetOneResourceByIdKeyFn,
  useResourcesServiceResourceGroupsAddResource,
  useResourcesServiceResourceGroupsGetMany,
  useResourcesServiceResourceGroupsRemoveResource,
} from '@attraccess/react-query-client';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useQueryClient } from '@tanstack/react-query';
import en from './en.json';
import de from './de.json';
import { useToastMessage } from '../../../components/toastProvider';
import { filterAndSortGroups, GroupFilter } from './groupsFilter';

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

export function useManageResourceGroupsStateRenderTable(model: ReturnType<typeof useManageResourceGroupsStateInputs>) {
  const renderTable = () => (
    <Table data-cy="resource-groups-list">
      <TableScrollContainer>
        <TableContent aria-label={model.t('table.ariaLabel')}>
          <TableHeader>
            <TableColumn isRowHeader>{model.t('columns.name')}</TableColumn>
            <TableColumn>{model.t('columns.assigned')}</TableColumn>
            <TableColumn>{model.t('columns.actions')}</TableColumn>
          </TableHeader>
          <TableBody
            items={model.visibleGroups}
            dependencies={[model.assignedIds, model.pendingGroupIds]}
            renderEmptyState={() => <EmptyState message={model.emptyMessage} />}
          >
            {(group) => {
              const isAssigned = model.assignedIds.has(group.id);
              const dotClass = isAssigned ? 'bg-success' : 'bg-default-300';
              const ringClass = isAssigned ? 'ring-success/30' : 'ring-default-300/30';
              const actionLabel = model.t(isAssigned ? 'row.toggleOff' : 'row.toggleOn', {
                resource: model.resourceName,
                group: group.name,
              });
              const buttonLabel = model.t(isAssigned ? 'row.remove' : 'row.add');
              const isPending = model.pendingGroupIds.has(group.id);
              return (
                <TableRow
                  key={group.id}
                  id={group.id}
                  data-cy={`resource-group-row-${group.id}`}
                  data-assigned={isAssigned ? 'true' : 'false'}
                >
                  <TableCell>
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        aria-hidden
                        className={`inline-block w-2.5 h-2.5 rounded-full ring-2 shrink-0 ${dotClass} ${ringClass}`}
                      />
                      <div className="min-w-0">
                        <p className="truncate" title={group.name}>
                          {group.name}
                        </p>
                        {group.description ? (
                          <p className="text-xs text-default-500 truncate max-w-md" title={group.description}>
                            {group.description}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant={isAssigned ? 'danger-soft' : 'primary'}
                      isDisabled={isPending}
                      isPending={isPending}
                      onPress={() => model.handleToggle(group)}
                      aria-label={actionLabel}
                      data-cy={`resource-group-row-${group.id}-toggle`}
                    >
                      {isPending ? null : isAssigned ? <MinusIcon size={14} /> : <PlusIcon size={14} />}
                      {buttonLabel}
                    </Button>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/resource-groups/${group.id}`}
                      className="text-xs inline-flex items-center gap-0.5"
                      data-cy={`resource-group-row-${group.id}-open`}
                      aria-label={`${model.t('row.openGroup')}: ${group.name}`}
                    >
                      {model.t('row.openGroup')}
                      <ChevronRightIcon size={14} />
                    </Link>
                  </TableCell>
                </TableRow>
              );
            }}
          </TableBody>
        </TableContent>
      </TableScrollContainer>
    </Table>
  );

  const renderToolbar = (onNewGroup: () => void) => (
    <GroupsToolbar
      search={model.search}
      onSearchChange={model.setSearch}
      searchPlaceholder={model.t('search.placeholder')}
      filter={model.filter}
      onFilterChange={model.setFilter}
      filterLabels={{
        all: model.t('filter.all'),
        assigned: model.t('filter.assigned'),
        available: model.t('filter.available'),
      }}
      assignedCount={model.counts.assigned}
      availableCount={model.counts.available}
      newGroupLabel={model.t('newGroup')}
      onNewGroup={onNewGroup}
    />
  );
  return { ...model, renderTable, renderToolbar } as const;
}

export function useManageResourceGroupsStateInputs({
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
    queryClient.invalidateQueries({
      queryKey: UseAccessControlServiceResourceIntroductionsGetPeopleKeyFn({ resourceId }),
    });
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

      const resourceKey = UseResourcesServiceGetOneResourceByIdKeyFn({ id: resourceId });
      const previous = queryClient.getQueryData<Resource>(resourceKey);
      if (previous) {
        const nextGroups = wasAssigned
          ? (previous.groups ?? []).filter((g) => g.id !== group.id)
          : [...(previous.groups ?? []), group];
        queryClient.setQueryData<Resource>(resourceKey, { ...previous, groups: nextGroups });
      }

      try {
        if (wasAssigned) {
          await removeResourceFromGroup({ groupId: group.id, resourceId });
        } else {
          await addResourceToGroup({ groupId: group.id, resourceId });
        }
        invalidateAll();
      } catch {
        if (previous) queryClient.setQueryData<Resource>(resourceKey, previous);
        toast.error({ title: t('errors.toggleFailed') });
      } finally {
        markPending(group.id, false);
      }
    },
    [
      addResourceToGroup,
      removeResourceFromGroup,
      assignedIds,
      invalidateAll,
      markPending,
      queryClient,
      resourceId,
      toast,
      t,
    ],
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

  const emptyMessage = allGroups.length === 0 ? t('empty.noGroups') : t('empty.noMatch');
  return {
    t,
    queryClient,
    toast,
    resource,
    groups,
    search,
    setSearch,
    filter,
    setFilter,
    pendingGroupIds,
    setPendingGroupIds,
    assignedIds,
    allGroups,
    invalidateAll,
    markPending,
    addResourceToGroup,
    removeResourceFromGroup,
    handleToggle,
    onGroupCreated,
    visibleGroups,
    counts,
    resourceName,
    emptyMessage,
    resourceId,
    hideHeader,
    rest,
  } as const;
}

export type ManageResourceGroupsProps = Omit<HTMLAttributes<HTMLElement>, 'children'> & {
  resourceId: number;
  hideHeader?: boolean;
};

export function ManageResourceGroups({ resourceId, hideHeader, ...rest }: Readonly<ManageResourceGroupsProps>) {
  const { t, content } = useManageResourceGroupsState({ resourceId, hideHeader, ...rest });

  if (hideHeader) {
    return <section {...rest}>{content}</section>;
  }

  return (
    <FlatSection icon={<GroupIcon className="w-4 h-4" />} title={t('title')} {...rest}>
      {content}
    </FlatSection>
  );
}
