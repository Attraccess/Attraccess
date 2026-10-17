import { type ReactElement } from 'react';
import { TableCell, Chip, type TableCellProps, type TableRowProps } from '@heroui/react';
import { Resource, ResourceUsage } from '@attraccess/react-query-client';
import { TFunction } from '@attraccess/plugins-frontend-ui';
import { DurationDisplay, DateTimeDisplay } from '@attraccess/plugins-frontend-ui';
import { DoorOpenIcon, LockIcon, MessageSquareText, UnlockIcon } from 'lucide-react';
import { AttraccessUser } from '@attraccess/plugins-frontend-ui';

/**
 * Generates table row cells based on session data and user permissions
 */
export function generateRowCells(
  session: ResourceUsage,
  t: TFunction,
  resource: Resource,
  showAllUsers: boolean,
  canUpdateResources: boolean,
  projectCellRenderer?: (session: ResourceUsage) => ReactElement,
  operatingDuration?: { canView: boolean; durationMs: number | undefined },
): TableRowProps<ResourceUsage>['children'] {
  const cells: ReactElement<TableCellProps>[] = [];

  // Only show user cell if we're showing all users (requires canUpdateResources)
  if (canUpdateResources && showAllUsers) {
    cells.push(
      <TableCell key={`user-${session.id}`}>
        <AttraccessUser user={session.user} />
      </TableCell>,
    );
  }

  const hasNotes = ((session.startNotes || '') + (session.endNotes || '')).trim().length > 0;

  if (resource.type === 'machine') {
    cells.push(
      <TableCell key={`start-${session.id}`} className="whitespace-nowrap">
        <DateTimeDisplay date={session.startTime} />
      </TableCell>,
      <TableCell key={`end-${session.id}`} className="hidden lg:table-cell whitespace-nowrap">
        <DateTimeDisplay date={session.endTime} />
      </TableCell>,
      <TableCell key={`duration-${session.id}`} className="whitespace-nowrap">
        <div className="flex items-center gap-2">
          <DurationDisplay
            minutes={session.usageInMinutes >= 0 ? session.usageInMinutes : null}
            alternativeText={
              <Chip color="accent" variant="soft">
                {t('rows.machine.inProgress')}
              </Chip>
            }
          />
          {hasNotes && <MessageSquareText className="w-4 h-4" role="img" aria-label={t('rows.machine.hasNotes')} />}
        </div>
      </TableCell>,
      ...(operatingDuration?.canView
        ? [
            <TableCell key={`operating-duration-${session.id}`} className="hidden xl:table-cell whitespace-nowrap">
              {operatingDuration.durationMs === undefined ? (
                '—'
              ) : (
                <DurationDisplay minutes={operatingDuration.durationMs / 60_000} />
              )}
            </TableCell>,
          ]
        : []),
      <TableCell key={`project-${session.id}`} className="hidden 2xl:table-cell">
        {projectCellRenderer ? projectCellRenderer(session) : session.project?.name}
      </TableCell>,
      <TableCell key={`supervisor-${session.id}`} className="hidden md:table-cell">
        {session.supervisorUser ? (
          <AttraccessUser user={session.supervisorUser} variant="mini" />
        ) : (
          <span className="text-gray-400 dark:text-gray-500">—</span>
        )}
      </TableCell>,
    );
  } else if (resource.type === 'door') {
    cells.push(
      <TableCell key={`time-${session.id}`}>
        <DateTimeDisplay date={session.startTime} />
      </TableCell>,
      <TableCell key={`action-${session.id}`} className="hidden md:table-cell">
        <div className="flex items-center gap-2 flex-row flex-grow w-full">
          {session.usageAction === 'door.lock' && <LockIcon />}
          {session.usageAction === 'door.unlock' && <UnlockIcon />}
          {session.usageAction === 'door.unlatch' && <DoorOpenIcon />}
          {t('rows.door.action.' + session.usageAction)}
        </div>
      </TableCell>,
    );
  }

  return cells;
}
