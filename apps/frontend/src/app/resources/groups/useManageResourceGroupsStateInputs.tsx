import { useCallback, useMemo, useState } from 'react';
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
import type { ManageResourceGroupsProps } from './index';

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
