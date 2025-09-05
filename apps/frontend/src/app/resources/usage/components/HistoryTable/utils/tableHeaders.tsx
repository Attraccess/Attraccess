import React, { ReactElement } from 'react';
import { TableColumn } from '@heroui/react';
import { TFunction } from 'i18next';
import { Resource } from '@attraccess/react-query-client';

/**
 * Generates table header columns based on user permissions
 */
export function generateHeaderColumns(
  t: TFunction,
  resource: Resource,
  showAllUsers: boolean,
  canManageResources: boolean
): ReactElement[] {
  const headers: ReactElement[] = [];

  // Only show user column if we're showing all users (requires canManageResources)
  if (canManageResources && showAllUsers) {
    headers.push(<TableColumn key="user">{t('user')}</TableColumn>);
  }

  if (resource.type === 'machine') {
    headers.push(
      <TableColumn key="startTime">{t('headers.machine.startTime')}</TableColumn>,
      <TableColumn key="endTime" className="hidden md:table-cell">
        {t('headers.machine.endTime')}
      </TableColumn>,
      <TableColumn key="duration">{t('headers.machine.duration')}</TableColumn>,
      <TableColumn key="icons">{''}</TableColumn>
    );
  } else if (resource.type === 'door') {
    headers.push(
      <TableColumn key="time">{t('headers.door.time')}</TableColumn>,
      <TableColumn key="action" className="hidden md:table-cell">
        {t('headers.door.action')}
      </TableColumn>
    );
  }

  return headers;
}
