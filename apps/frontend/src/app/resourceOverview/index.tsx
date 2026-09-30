import { useQueries, useQuery } from '@tanstack/react-query';
import {
  useResourcesServiceResourceGroupsGetMany,
  ResourcesService,
  UseResourcesServiceGetAllResourcesKeyFn,
} from '@attraccess/react-query-client';
import { Toolbar } from './toolbar/toolbar';
import { ResourceGroupCard } from './resourceGroupCard';
import { useCallback, useMemo, useState } from 'react';
import { useDebounce } from '@attraccess/plugins-frontend-ui';
import { NoResourcesFound } from './noResourcesFound';
import { ActiveUsageSessionsBanner } from './activeUsageSessionsBanner';
import { CreateResourceDrawer } from './createResourceDrawer';

enum PersistedFilterProps {
  onlyInUseByMe = 'onlyInUseByMe',
  onlyWithPermissions = 'onlyWithPermissions',
  hideEmptyResourceGroups = 'hideEmptyResourceGroups',
}
function getLocalStorageFilterKey(filter: PersistedFilterProps) {
  return `resourceOverview.toolbar.filter.${filter}`;
}

function getValueFromLocalStorage(filter: PersistedFilterProps, defaultValue: boolean) {
  const value = localStorage.getItem(getLocalStorageFilterKey(filter));
  if (value === null) {
    return defaultValue;
  }
  return value === 'true';
}

export function ResourceOverview() {
  const [createOpen, setCreateOpen] = useState(false);
  const { data: groups } = useResourcesServiceResourceGroupsGetMany();

  const [searchValue, setSearchValue] = useState('');
  const [filterByOnlyInUseByMe, setFilterByOnlyInUseByMeState] = useState(
    getValueFromLocalStorage(PersistedFilterProps.onlyInUseByMe, false),
  );
  const [filterByOnlyWithPermissions, setFilterByOnlyWithPermissionsState] = useState(
    getValueFromLocalStorage(PersistedFilterProps.onlyWithPermissions, true),
  );
  const [filterByHideEmptyResourceGroups, setFilterByHideEmptyResourceGroupsState] = useState(
    getValueFromLocalStorage(PersistedFilterProps.hideEmptyResourceGroups, true),
  );

  const debouncedSearchValue = useDebounce(searchValue, 250);

  const setFilterByOnlyInUseByMe = useCallback((value: boolean) => {
    setFilterByOnlyInUseByMeState(value);
    localStorage.setItem(
      getLocalStorageFilterKey(PersistedFilterProps.onlyInUseByMe),
      value === true ? 'true' : 'false',
    );
  }, []);

  const setFilterByOnlyWithPermissions = useCallback((value: boolean) => {
    setFilterByOnlyWithPermissionsState(value);
    localStorage.setItem(
      getLocalStorageFilterKey(PersistedFilterProps.onlyWithPermissions),
      value === true ? 'true' : 'false',
    );
  }, []);

  const setFilterByHideEmptyResourceGroups = useCallback((value: boolean) => {
    setFilterByHideEmptyResourceGroupsState(value);
    localStorage.setItem(
      getLocalStorageFilterKey(PersistedFilterProps.hideEmptyResourceGroups),
      value === true ? 'true' : 'false',
    );
  }, []);

  const groupIds = useMemo(() => {
    const ids: Array<number | 'none'> = ['none'];

    groups?.forEach((group) => ids.push(group.id));

    return ids;
  }, [groups]);

  // Match the cards' visible group scope; a global resource query can include
  // resources belonging only to hidden groups that this user cannot see.
  const matchingResources = useQueries({
    queries: groupIds.map((groupId) => {
      const params = {
        groupId: groupId === 'none' ? -1 : groupId,
        search: debouncedSearchValue?.trim() || undefined,
        onlyInUseByMe: filterByOnlyInUseByMe,
        onlyWithPermissions: filterByOnlyWithPermissions,
        page: 1,
        // Share the first-page query with ResourceGroupCard instead of fetching twice.
        limit: 10,
      };
      return {
        queryKey: UseResourcesServiceGetAllResourcesKeyFn(params),
        queryFn: () => ResourcesService.getAllResources(params),
        enabled: groups !== undefined,
      };
    }),
  });
  const noMatchingResources = groups !== undefined && matchingResources.every((query) => query.data?.data.length === 0);

  // One server-side visibility check replaces per-group unfiltered probes.
  // Keep it under the resource-list prefix so resource mutations invalidate it.
  const { data: unfilteredResources } = useQuery({
    queryKey: UseResourcesServiceGetAllResourcesKeyFn({}, ['visible-existence', groupIds]),
    queryFn: () => ResourcesService.resourceGroupsResourcesExist(),
    enabled: noMatchingResources,
  });
  const hasResources = unfilteredResources?.hasResources ?? false;
  const showEmptyState = noMatchingResources && unfilteredResources !== undefined;

  return (
    <div>
      <Toolbar
        onOpenCreate={() => setCreateOpen(true)}
        search={searchValue}
        onSearchChanged={setSearchValue}
        onlyInUseByMe={filterByOnlyInUseByMe}
        onOnlyInUseByMeChanged={setFilterByOnlyInUseByMe}
        onlyWithPermissions={filterByOnlyWithPermissions}
        onOnlyWithPermissionsChanged={setFilterByOnlyWithPermissions}
        hideEmptyResourceGroups={filterByHideEmptyResourceGroups}
        onHideEmptyResourceGroupsChanged={setFilterByHideEmptyResourceGroups}
        highlightSearch={showEmptyState && hasResources}
        highlightFilter={showEmptyState && hasResources}
      />

      <ActiveUsageSessionsBanner onShowMySessions={() => setFilterByOnlyInUseByMe(true)} />

      <div className="flex flex-row flex-wrap gap-4">
        {showEmptyState && (
          <NoResourcesFound
            onOpenCreate={() => setCreateOpen(true)}
            hasResources={hasResources}
            onClearFilterAndSearch={() => {
              setFilterByOnlyInUseByMe(false);
              setFilterByOnlyWithPermissions(false);
              setFilterByHideEmptyResourceGroups(false);
              setSearchValue('');
            }}
          />
        )}

        {groupIds.map((id) => (
          <ResourceGroupCard
            key={id}
            groupId={id}
            filter={{
              search: searchValue,
              onlyInUseByMe: filterByOnlyInUseByMe,
              onlyWithPermissions: filterByOnlyWithPermissions,
            }}
            hideIfEmpty={filterByHideEmptyResourceGroups}
            className="flex flex-1 min-w-0 basis-full xl:basis-[calc(50%-1rem)]"
          />
        ))}
      </div>
      <CreateResourceDrawer isOpen={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
