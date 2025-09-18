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
import { TableDataLoadingIndicator } from '../../../../../components/tableComponents';
import { EmptyState } from '../../../../../components/emptyState';
import { useReactQueryStatusToHeroUiTableLoadingState } from '../../../../../hooks/useReactQueryStatusToHeroUiTableLoadingState';
import en from './utils/translations/en.json';
import de from './utils/translations/de.json';

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
  const { t } = useTranslations({ en, de });
  const { user } = useAuth();

  const [page, setPage] = useState(1);
  const [rowsPerPage] = useState(5);

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
  }, []);

  const {
    data: usageHistory,
    error,
    status: fetchStatus,
    isFetched: isFetchedUsageHistory,
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
    },
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
      if (!resource) {
        return false;
      }

      switch (resource.type) {
        case 'machine':
          return session.usageAction === 'usage';
        case 'door':
          return (
            session.usageAction === 'door.lock' ||
            session.usageAction === 'door.unlock' ||
            session.usageAction === 'door.unlatch'
          );
        default: {
          const exhaustiveCheck: never = resource?.type;
          throw new Error(`Unknown resource type: ${exhaustiveCheck}`);
        }
      }
    });
  }, [usageHistory?.data, resource]);

  if (error) {
    return <div className="text-center py-4 text-red-500">{t('errorLoadingHistory')}</div>;
  }

  return (
    <Table
      aria-label="Resource usage history"
      shadow="none"
      data-cy="resource-usage-history-table"
      bottomContent={isFetchedUsageHistory && <Pagination total={totalPages} page={page} onChange={handlePageChange} />}
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
