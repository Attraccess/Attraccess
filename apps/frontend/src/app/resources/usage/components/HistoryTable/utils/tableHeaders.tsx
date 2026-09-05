import { type ReactElement } from 'react';
import { TableColumn, type TableColumnProps } from '@heroui/react';
import { TFunction } from '@attraccess/plugins-frontend-ui';
import { Resource } from '@attraccess/react-query-client';

export function generateHeaderColumns(
  t: TFunction,
  resource: Resource,
  showAllUsers: boolean,
  canUpdateResources: boolean,
  canViewOperatingDuration = false,
): ReactElement<TableColumnProps>[] {
  const headers: ReactElement<TableColumnProps>[] = [];

  const showUser = canUpdateResources && showAllUsers;

  if (showUser) {
    headers.push(
      <TableColumn key="user" id="user" isRowHeader>
        {t('headers.user')}
      </TableColumn>,
    );
  }

  if (resource.type === 'machine') {
    headers.push(
      <TableColumn key="startTime" id="startTime" isRowHeader={!showUser}>
        {t('headers.machine.startTime')}
      </TableColumn>,
      <TableColumn key="endTime" id="endTime" className="hidden lg:table-cell">
        {t('headers.machine.endTime')}
      </TableColumn>,
      <TableColumn key="duration" id="duration">
        {t('headers.machine.duration')}
      </TableColumn>,
      ...(canViewOperatingDuration
        ? [
            <TableColumn key="operatingDuration" id="operatingDuration" className="hidden xl:table-cell">
              {t('headers.machine.operatingDuration')}
            </TableColumn>,
          ]
        : []),
      <TableColumn key="project" id="project" className="hidden 2xl:table-cell">
        {t('headers.machine.project')}
      </TableColumn>,
      <TableColumn key="supervisor" id="supervisor" className="hidden md:table-cell">
        {t('headers.machine.supervisor')}
      </TableColumn>,
    );
  } else if (resource.type === 'door') {
    headers.push(
      <TableColumn key="time" id="time" isRowHeader={!showUser}>
        {t('headers.door.time')}
      </TableColumn>,
      <TableColumn key="action" id="action" className="hidden md:table-cell">
        {t('headers.door.action')}
      </TableColumn>,
    );
  }

  return headers;
}
