import {
  useResourcesServiceResourceGroupsGetMany,
  useResourcesServiceGetAllResources,
} from '@attraccess/react-query-client';
import { Toolbar } from './toolbar/toolbar';
import { ResourceGroupCard } from './resourceGroupCard';
import { useCallback, useMemo, useState } from 'react';
import { useDebounce } from '../../hooks/useDebounce';
import { NoResourcesFound } from './noResourcesFound';
import { ActiveUsageSessionsBanner } from './activeUsageSessionsBanner';

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
  const { data: groups } = useResourcesServiceResourceGroupsGetMany();

  const [searchValue, setSearchValue] = useState('');
  const [filterByOnlyInUseByMe, setFilterByOnlyInUseByMeState] = useState(
    getValueFromLocalStorage(PersistedFilterProps.onlyInUseByMe, false)
  );
  const [filterByOnlyWithPermissions, setFilterByOnlyWithPermissionsState] = useState(
    getValueFromLocalStorage(PersistedFilterProps.onlyWithPermissions, true)
  );
  const [filterByHideEmptyResourceGroups, setFilterByHideEmptyResourceGroupsState] = useState(
    getValueFromLocalStorage(PersistedFilterProps.hideEmptyResourceGroups, true)
  );

  const debouncedSearchValue = useDebounce(searchValue, 250);

  const setFilterByOnlyInUseByMe = useCallback((value: boolean) => {
    setFilterByOnlyInUseByMeState(value);
    localStorage.setItem(
      getLocalStorageFilterKey(PersistedFilterProps.onlyInUseByMe),
      value === true ? 'true' : 'false'
    );
  }, []);

  const setFilterByOnlyWithPermissions = useCallback((value: boolean) => {
    setFilterByOnlyWithPermissionsState(value);
    localStorage.setItem(
      getLocalStorageFilterKey(PersistedFilterProps.onlyWithPermissions),
      value === true ? 'true' : 'false'
    );
  }, []);

  const groupIds = useMemo(() => {
    const ids: Array<number | 'none'> = ['none'];

    groups?.forEach((group) => ids.push(group.id));

    return ids;
  }, [groups]);

  // Check if there are any resources matching the current filters across all groups
  const { data: allResources, isLoading: isLoadingAllResources } = useResourcesServiceGetAllResources({
    search: debouncedSearchValue?.trim() || undefined,
    onlyInUseByMe: filterByOnlyInUseByMe,
    onlyWithPermissions: filterByOnlyWithPermissions,
    page: 1,
    limit: 1, // We only need to check if any resources exist
  });

  return (
    <div>
      <Toolbar
        search={searchValue}
        onSearchChanged={setSearchValue}
        onlyInUseByMe={filterByOnlyInUseByMe}
        onOnlyInUseByMeChanged={setFilterByOnlyInUseByMe}
        onlyWithPermissions={filterByOnlyWithPermissions}
        onOnlyWithPermissionsChanged={setFilterByOnlyWithPermissions}
        hideEmptyResourceGroups={filterByHideEmptyResourceGroups}
        onHideEmptyResourceGroupsChanged={setFilterByHideEmptyResourceGroupsState}
        highlightSearch={allResources?.data.length === 0}
        highlightFilter={allResources?.data.length === 0}
      />

      <ActiveUsageSessionsBanner onShowMySessions={() => setFilterByOnlyInUseByMe(true)} />

      <div className="flex flex-row flex-wrap gap-4">
        {!isLoadingAllResources && allResources?.data.length === 0 && <NoResourcesFound />}

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
            className="flex flex-1 min-w-[100%] md:min-w-[500px]"
          />
        ))}
      </div>
    </div>
  );
}
