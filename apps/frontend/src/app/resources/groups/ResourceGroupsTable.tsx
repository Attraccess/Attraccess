import { FolderOpenIcon, MinusIcon, PlusIcon } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  TableScrollContainer,
} from '@heroui/react';
import {
  Button,
  EmptyState,
  TableActionsColumnHeader,
  TableRowActions,
  useTranslations,
} from '@attraccess/plugins-frontend-ui';
import type { ResourceGroup } from '@attraccess/react-query-client';
import en from './en.json';
import de from './de.json';

interface ResourceGroupsTableProps {
  groups: ResourceGroup[];
  assignedIds: ReadonlySet<number>;
  pendingGroupIds: ReadonlySet<number>;
  resourceName: string;
  emptyMessage: string;
  onToggle: (group: ResourceGroup) => void;
}

/** Lists resource groups with a button each to add or remove the resource. */
export function ResourceGroupsTable({
  groups,
  assignedIds,
  pendingGroupIds,
  resourceName,
  emptyMessage,
  onToggle,
}: Readonly<ResourceGroupsTableProps>) {
  const { t } = useTranslations({ de, en });
  return (
    <Table data-cy="resource-groups-list">
      <TableScrollContainer>
        <TableContent aria-label={t('table.ariaLabel')}>
          <TableHeader>
            <TableColumn isRowHeader>{t('columns.name')}</TableColumn>
            <TableColumn>{t('columns.assigned')}</TableColumn>
            <TableColumn>
              <TableActionsColumnHeader />
            </TableColumn>
          </TableHeader>
          <TableBody
            items={groups}
            dependencies={[assignedIds, pendingGroupIds]}
            renderEmptyState={() => <EmptyState message={emptyMessage} />}
          >
            {(group) => {
              const isAssigned = assignedIds.has(group.id);
              const dotClass = isAssigned ? 'bg-success' : 'bg-default-300';
              const ringClass = isAssigned ? 'ring-success/30' : 'ring-default-300/30';
              const actionLabel = t(isAssigned ? 'row.toggleOff' : 'row.toggleOn', {
                resource: resourceName,
                group: group.name,
              });
              const buttonLabel = t(isAssigned ? 'row.remove' : 'row.add');
              const isPending = pendingGroupIds.has(group.id);
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
                      onPress={() => onToggle(group)}
                      aria-label={actionLabel}
                      data-cy={`resource-group-row-${group.id}-toggle`}
                    >
                      {isPending ? null : isAssigned ? <MinusIcon size={14} /> : <PlusIcon size={14} />}
                      {buttonLabel}
                    </Button>
                  </TableCell>
                  <TableCell>
                    <TableRowActions
                      itemName={group.name}
                      actions={[
                        {
                          key: 'open',
                          label: t('row.openGroup'),
                          icon: FolderOpenIcon,
                          href: `/resource-groups/${group.id}`,
                          'data-cy': `resource-group-row-${group.id}-open`,
                        },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              );
            }}
          </TableBody>
        </TableContent>
      </TableScrollContainer>
    </Table>
  );
}
