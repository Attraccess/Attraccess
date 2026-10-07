import { Button, Dropdown, DropdownItem, DropdownMenu, DropdownPopover, DropdownTrigger } from '@heroui/react';
import { PlusIcon } from 'lucide-react';
import { FILTER_KEYS } from './index.state';
import type { useUserManagementPageState } from './useUserManagementPageState';
type Props = Pick<ReturnType<typeof useUserManagementPageState>, 'activeFilters' | 'addFilter' | 't'>;
export function UserManagementAddFilter({ activeFilters, addFilter, t }: Props) {
  return activeFilters.length < FILTER_KEYS.length ? (
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
  ) : null;
}
