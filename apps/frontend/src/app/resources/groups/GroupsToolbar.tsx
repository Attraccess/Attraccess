import { Button, ButtonGroup, InputGroup, TextField } from '@heroui/react';
import { PlusIcon, SearchIcon } from 'lucide-react';
import type { GroupFilter } from './groupsFilter';

export interface GroupsToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  filter: GroupFilter;
  onFilterChange: (value: GroupFilter) => void;
  filterLabels: { all: string; assigned: string; available: string };
  assignedCount: number;
  availableCount: number;
  newGroupLabel: string;
  onNewGroup: () => void;
}

interface ChipDef {
  value: GroupFilter;
  label: string;
  badge?: number;
}

export function GroupsToolbar({
  search,
  onSearchChange,
  searchPlaceholder,
  filter,
  onFilterChange,
  filterLabels,
  assignedCount,
  availableCount,
  newGroupLabel,
  onNewGroup,
}: Readonly<GroupsToolbarProps>) {
  const chips: ChipDef[] = [
    { value: 'all', label: filterLabels.all },
    { value: 'assigned', label: filterLabels.assigned, badge: assignedCount },
    { value: 'available', label: filterLabels.available, badge: availableCount },
  ];

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 flex-1 min-w-0">
        <TextField value={search} onChange={onSearchChange} className="sm:max-w-xs w-full">
          <InputGroup>
            <InputGroup.Prefix>
              <SearchIcon size={16} />
            </InputGroup.Prefix>
            <InputGroup.Input
              placeholder={searchPlaceholder}
              data-cy="resource-groups-search-input"
            />
          </InputGroup>
        </TextField>
        <ButtonGroup size="sm" data-cy="resource-groups-filter">
          {chips.map((c) => (
            <Button
              key={c.value}
              variant={filter === c.value ? 'primary' : 'ghost'}
              onPress={() => onFilterChange(c.value)}
              data-cy={`resource-groups-filter-${c.value}`}
              aria-pressed={filter === c.value}
            >
              {c.label}
              {typeof c.badge === 'number' ? ` · ${c.badge}` : ''}
            </Button>
          ))}
        </ButtonGroup>
      </div>
      <Button
        variant="secondary"
        size="sm"
        onPress={onNewGroup}
        data-cy="resource-groups-new-group-button"
      >
        <PlusIcon size={16} />
        {newGroupLabel}
      </Button>
    </div>
  );
}
