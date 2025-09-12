import { ReactElement } from 'react';
import { TableCell, Chip } from '@heroui/react';
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
  canManageResources: boolean,
): ReactElement[] {
  const cells: ReactElement[] = [];

  // Only show user cell if we're showing all users (requires canManageResources)
  if (canManageResources && showAllUsers) {
    cells.push(
      <TableCell key={`user-${session.id}`}>
        <AttraccessUser user={session.user} />
      </TableCell>,
    );
  }

  const hasNotes = ((session.startNotes || '') + (session.endNotes || '')).trim().length > 0;

  if (resource.type === 'machine') {
    cells.push(
      <TableCell key={`start-${session.id}`}>
        <DateTimeDisplay date={session.startTime} />
      </TableCell>,
      <TableCell key={`end-${session.id}`} className="hidden md:table-cell">
        <DateTimeDisplay date={session.endTime} />
      </TableCell>,
      <TableCell key={`duration-${session.id}`}>
        <DurationDisplay
          minutes={session.usageInMinutes >= 0 ? session.usageInMinutes : null}
          alternativeText={
            <Chip color="primary" variant="flat">
              {t('rows.machine.inProgress')}
            </Chip>
          }
        />
      </TableCell>,
      <TableCell key={`icons-${session.id}`} className="flex items-center gap-2">
        {hasNotes && <MessageSquareText />}
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
