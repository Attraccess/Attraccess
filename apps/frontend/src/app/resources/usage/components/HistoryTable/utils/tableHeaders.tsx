import { type ReactElement } from 'react';
import { TableColumn, type TableColumnProps, type TableHeaderProps } from '@heroui/react';
import { TFunction } from '@attraccess/plugins-frontend-ui';
import { Resource } from '@attraccess/react-query-client';

/**
 * Generates table header columns based on user permissions
 */
export function generateHeaderColumns(
  t: TFunction,
  resource: Resource,
  showAllUsers: boolean,
  canManageResources: boolean,
): TableHeaderProps<unknown>['children'] {
  const headers: ReactElement<TableColumnProps<unknown>>[] = [];

  // Only show user column if we're showing all users (requires canManageResources)
  if (canManageResources && showAllUsers) {
    headers.push(<TableColumn key="user" id="user">{t('headers.user')}</TableColumn>);
  }

  if (resource.type === 'machine') {
    headers.push(
      <TableColumn key="startTime" id="startTime">{t('headers.machine.startTime')}</TableColumn>,
      <TableColumn key="endTime" id="endTime" className="hidden md:table-cell">
        {t('headers.machine.endTime')}
      </TableColumn>,
      <TableColumn key="duration" id="duration">{t('headers.machine.duration')}</TableColumn>,
      <TableColumn key="project" id="project" className="hidden md:table-cell">
        {t('headers.machine.project')}
      </TableColumn>,
      <TableColumn key="icons" id="icons">{''}</TableColumn>,
    );
  } else if (resource.type === 'door') {
    headers.push(
      <TableColumn key="time" id="time">{t('headers.door.time')}</TableColumn>,
      <TableColumn key="action" id="action" className="hidden md:table-cell">
        {t('headers.door.action')}
      </TableColumn>,
    );
  }

  return headers;
}
