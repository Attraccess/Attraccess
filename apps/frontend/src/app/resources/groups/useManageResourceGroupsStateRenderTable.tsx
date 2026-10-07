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
import { Button } from '../../../components/button';
import { ChevronRightIcon, MinusIcon } from 'lucide-react';
import { EmptyState } from '../../../components/emptyState';
import { GroupsToolbar } from './GroupsToolbar';
import { PlusIcon } from 'lucide-react';
import type { useManageResourceGroupsStateInputs } from './useManageResourceGroupsStateInputs';

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
