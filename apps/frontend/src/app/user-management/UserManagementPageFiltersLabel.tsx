import {
  Button,
  CloseButton,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownPopover,
  DropdownTrigger,
} from '@heroui/react';
import { PlusIcon } from 'lucide-react';
import { Select } from '../../components/select';
import { FilterKey } from './index.filter-key';
import { MultiValueCondition } from './index.multi-value-condition';
import { FILTER_KEYS } from './index.filter-keys';
import { MultiValueFilter } from './index.multi-value-filter';
import { SingleValueFilter } from './index.single-value-filter';
import { Props } from './UserManagementFilterProps';

export function UserManagementPageFiltersLabel({
  t,
  activeFilters,
  replaceFilter,
  roleExcludes,
  roleMatch,
  setRoleCondition,
  roles,
  roleName,
  excludeRoleIds,
  roleIds,
  updateFilters,
  emailVerified,
  ssoProviderExcludes,
  ssoProviderMatch,
  setSsoProviderCondition,
  ssoProviders,
  ssoProviderNone,
  hasSsoProvider,
  excludeSsoProviderIds,
  ssoProviderIds,
  removeFilter,
  addFilter,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label={t('filters.label')}>
      {activeFilters.map((filter) => (
        <div
          key={filter}
          role="group"
          aria-label={t(`filters.${filter}`)}
          className="grid max-w-full grid-cols-[max-content_minmax(0,1fr)_2.25rem] overflow-hidden rounded-medium border border-default-200 bg-content1 text-sm shadow-xs sm:flex sm:w-auto"
        >
          <Select
            className="min-w-fit whitespace-nowrap"
            aria-label={t('filters.category')}
            value={filter}
            onChange={(value) => replaceFilter(filter, value as FilterKey)}
            items={FILTER_KEYS.filter((key) => key === filter || !activeFilters.includes(key)).map((key) => ({
              key,
              label: t(`filters.${key}`),
            }))}
          />
          {filter === 'role' ? (
            <>
              <Select
                className="min-w-fit border-l border-default-200 whitespace-nowrap"
                aria-label={t('filters.roleMatch')}
                value={roleExcludes ? 'none' : roleMatch}
                onChange={(value) => setRoleCondition(value as MultiValueCondition)}
                items={[
                  { key: 'any', label: t('filters.isAnyOf') },
                  { key: 'all', label: t('filters.isAllOf') },
                  { key: 'none', label: t('filters.isNoneOf') },
                ]}
              />
              <div className="col-span-2 min-w-0 border-t border-default-200 sm:col-span-1 sm:border-l sm:border-t-0">
                <MultiValueFilter
                  ariaLabel={t('filters.roleValues')}
                  selectedCountLabel={(count) => t('filters.selectedCount', { count })}
                  options={(roles ?? []).map((role) => ({ key: String(role.id), label: roleName(role) }))}
                  selectedKeys={(roleExcludes ? excludeRoleIds : roleIds).map(String)}
                  onSelectionChange={(keys) =>
                    updateFilters((params) => {
                      const param = roleExcludes ? 'excludeRoleId' : 'roleId';
                      params.delete(param);
                      keys.forEach((key) => params.append(param, key));
                      if (keys.length === 0) params.delete('roleMatch');
                    })
                  }
                  dataCy="user-management-role-filter"
                  doneLabel={t('filters.done')}
                />
              </div>
            </>
          ) : filter === 'emailVerified' ? (
            <>
              <span className="border-l border-default-200 px-3 py-1.5 text-default-500">{t('filters.is')}</span>
              <div className="col-span-2 min-w-0 border-t border-default-200 sm:col-span-1 sm:border-l sm:border-t-0">
                <SingleValueFilter
                  ariaLabel={t('filters.emailVerificationStatus')}
                  options={[
                    { key: 'true', label: t('filters.verified') },
                    { key: 'false', label: t('filters.notVerified') },
                  ]}
                  selectedKey={emailVerified === 'true' || emailVerified === 'false' ? emailVerified : undefined}
                  onSelectionChange={(key) =>
                    updateFilters((params) => (key ? params.set('emailVerified', key) : params.delete('emailVerified')))
                  }
                  dataCy="user-management-email-verified-filter"
                  doneLabel={t('filters.done')}
                />
              </div>
            </>
          ) : (
            <>
              <Select
                className="min-w-fit border-l border-default-200 whitespace-nowrap"
                aria-label={t('filters.ssoProviderMatch')}
                value={ssoProviderExcludes ? 'none' : ssoProviderMatch}
                onChange={(value) => setSsoProviderCondition(value as MultiValueCondition)}
                items={[
                  { key: 'any', label: t('filters.isAnyOf') },
                  { key: 'all', label: t('filters.isAllOf') },
                  { key: 'none', label: t('filters.isNoneOf') },
                ]}
              />
              <div className="col-span-2 min-w-0 border-t border-default-200 sm:col-span-1 sm:border-l sm:border-t-0">
                <MultiValueFilter
                  ariaLabel={t('filters.ssoProviderValues')}
                  selectedCountLabel={(count) => t('filters.selectedCount', { count })}
                  options={[
                    { key: 'none', label: t('filters.none') },
                    ...(ssoProviders ?? []).map((provider) => ({
                      key: String(provider.id),
                      label: provider.name,
                    })),
                  ]}
                  selectedKeys={[
                    ...(ssoProviderNone || hasSsoProvider ? ['none'] : []),
                    ...(ssoProviderExcludes ? excludeSsoProviderIds : ssoProviderIds).map(String),
                  ]}
                  onSelectionChange={(keys) =>
                    updateFilters((params) => {
                      const isExcluding = ssoProviderExcludes;
                      const param = isExcluding ? 'excludeSsoProviderId' : 'ssoProviderId';
                      params.delete(param);
                      params.delete('ssoProviderNone');
                      params.delete('hasSsoProvider');
                      if (keys.includes('none')) {
                        params.set(isExcluding ? 'hasSsoProvider' : 'ssoProviderNone', 'true');
                      }
                      keys.filter((key) => key !== 'none').forEach((key) => params.append(param, key));
                      if (keys.length === 0) params.delete('ssoProviderMatch');
                    })
                  }
                  dataCy="user-management-sso-provider-filter"
                  doneLabel={t('filters.done')}
                />
              </div>
            </>
          )}
          <CloseButton
            className="self-center justify-self-center"
            aria-label={t('filters.remove')}
            onPress={() => removeFilter(filter)}
          />
        </div>
      ))}
      {activeFilters.length < FILTER_KEYS.length ? (
        <Dropdown>
          <DropdownTrigger>
            <Button size="sm" variant="ghost" aria-label={t('filters.add')}>
              <PlusIcon size={14} />
              {activeFilters.length === 0 ? t('filters.add') : null}
            </Button>
          </DropdownTrigger>
          <DropdownPopover>
            <DropdownMenu aria-label={t('filters.add')}>
              {FILTER_KEYS.filter((filter) => !activeFilters.includes(filter)).map((filter) => (
                <DropdownItem key={filter} id={filter} onPress={() => addFilter(filter)}>
                  {t(`filters.${filter}`)}
                </DropdownItem>
              ))}
            </DropdownMenu>
          </DropdownPopover>
        </Dropdown>
      ) : null}
    </div>
  );
}
