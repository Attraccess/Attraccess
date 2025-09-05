import { useCallback, useMemo, useState } from 'react';
import { Table, TableHeader, TableBody, TableRow, Pagination } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { generateHeaderColumns } from './utils/tableHeaders';
import { generateRowCells } from './utils/tableRows';
import {
  useResourcesServiceResourceUsageGetHistory,
  ResourceUsage,
  useResourcesServiceGetOneResourceById,
} from '@attraccess/react-query-client';
import { useAuth } from '../../../../../hooks/useAuth';
import { Select } from '../../../../../components/select';
import { TableDataLoadingIndicator } from '../../../../../components/tableComponents';
import { EmptyState } from '../../../../../components/emptyState';
import { useReactQueryStatusToHeroUiTableLoadingState } from '../../../../../hooks/useReactQueryStatusToHeroUiTableLoadingState';

import * as en from './utils/translations/en';
import * as de from './utils/translations/de';

interface HistoryTableProps {
  resourceId: number;
  showAllUsers?: boolean;
  canManageResources: boolean;
  onSessionClick: (session: ResourceUsage) => void;
}

export const HistoryTable = ({
  resourceId,
  showAllUsers = false,
  canManageResources,
  onSessionClick,
}: HistoryTableProps) => {
  const { t } = useTranslations('historyTable', { en, de });
  const { user } = useAuth();

  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(5);

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
  }, []);

  const handleRowsPerPageChange = useCallback((newRowsPerPage: number) => {
    setRowsPerPage(newRowsPerPage);
    setPage(1);
  }, []);

  const handleSelectionChange = useCallback(
    (key: string) => {
      handleRowsPerPageChange(Number(key));
    },
    [handleRowsPerPageChange]
  );

  const {
    data: usageHistory,
    error,
    status: fetchStatus,
  } = useResourcesServiceResourceUsageGetHistory(
    {
      resourceId,
      page,
      limit: rowsPerPage,
      userId: showAllUsers ? undefined : user?.id,
    },
    undefined,
    {
      enabled: !!user,
    }
  );

  const { data: resource } = useResourcesServiceGetOneResourceById({ id: resourceId });

  const headerColumns = useMemo(() => {
    if (!resource) {
      return [];
    }

    return generateHeaderColumns(t, resource, showAllUsers, canManageResources);
  }, [t, showAllUsers, canManageResources, resource]);

  const loadingState = useReactQueryStatusToHeroUiTableLoadingState(fetchStatus);

  const totalPages = useMemo(() => {
    if (!usageHistory?.total) {
      return 1;
    }
    return Math.ceil(usageHistory.total / rowsPerPage);
  }, [usageHistory?.total, rowsPerPage]);

  const filteredHistory = useMemo(() => {
    return (usageHistory?.data ?? []).filter((session) => {
      switch (resource?.type) {
        case 'machine':
          return session.usageAction === 'usage';
        case 'door':
          return (
            session.usageAction === 'door.lock' ||
            session.usageAction === 'door.unlock' ||
            session.usageAction === 'door.unlatch'
          );
        default:
          return false;
      }
    });
  }, [usageHistory?.data, resource?.type]);

  if (error) {
    return <div className="text-center py-4 text-red-500">{t('errorLoadingHistory')}</div>;
  }

  return (
    <Table
      aria-label="Resource usage history"
      shadow="none"
      data-cy="resource-usage-history-table"
      bottomContent={
        <div className="flex justify-between items-center mt-4">
          <div className="flex items-center gap-2">
            <Select
              selectedKey={rowsPerPage.toString()}
              onSelectionChange={handleSelectionChange}
              items={[5, 10, 25, 50].map((item) => ({
                key: item.toString(),
                label: item.toString(),
              }))}
              label="Rows per page"
            />
          </div>
          <Pagination total={totalPages} page={page} onChange={handlePageChange} />
        </div>
      }
    >
      <TableHeader>{headerColumns}</TableHeader>
      <TableBody
        loadingState={loadingState}
        loadingContent={<TableDataLoadingIndicator />}
        emptyContent={<EmptyState />}
      >
        {filteredHistory.map((session: ResourceUsage) => (
          <TableRow
            key={session.id}
            className="cursor-pointer hover:bg-primary-50 transition-bg duration-300"
            onClick={() => onSessionClick(session)}
          >
            {resource ? generateRowCells(session, t, resource, showAllUsers, canManageResources) : []}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};
