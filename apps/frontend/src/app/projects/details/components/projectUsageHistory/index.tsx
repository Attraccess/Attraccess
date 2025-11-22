import { useState, useMemo, useCallback } from 'react';
import {
  Card,
  CardBody,
  CardHeader,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Pagination,
} from '@heroui/react';
import { DateTimeDisplay, useTranslations } from '@attraccess/plugins-frontend-ui';
import { useProjectsServiceGetProjectUsageHistory, ResourceUsage } from '@attraccess/react-query-client';
import en from './en.json';
import de from './de.json';
import { TableDataLoadingIndicator } from '../../../../../components/tableComponents';
import { EmptyState } from '../../../../../components/emptyState';
import { useReactQueryStatusToHeroUiTableLoadingState } from '../../../../../hooks/useReactQueryStatusToHeroUiTableLoadingState';
import { UsageNotesModal } from '../../../../resources/usage/components/UsageNotesModal';
import { AttraccessUser } from '@attraccess/plugins-frontend-ui';
import { HistoryHeader } from '../../../../resources/usage/components/HistoryHeader';

type ProjectUsageHistoryProps = {
  projectId: number;
};

const ROWS_PER_PAGE = 10;

export function ProjectUsageHistory({ projectId }: ProjectUsageHistoryProps) {
  const { t } = useTranslations({ en, de });
  const [page, setPage] = useState(1);
  const [selectedSession, setSelectedSession] = useState<ResourceUsage | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { data, status } = useProjectsServiceGetProjectUsageHistory({
    id: projectId,
    page,
    limit: ROWS_PER_PAGE,
  });

  const loadingState = useReactQueryStatusToHeroUiTableLoadingState(status);

  const totalPages = useMemo(() => {
    if (!data?.total) {
      return 1;
    }
    return Math.max(1, Math.ceil(data.total / ROWS_PER_PAGE));
  }, [data?.total]);

  const handleRowAction = useCallback(
    (session: ResourceUsage) => {
      setSelectedSession(session);
      setIsModalOpen(true);
    },
    [setSelectedSession],
  );

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setSelectedSession(null);
  }, []);

  return (
    <>
      <Card>
        <CardHeader>
          <HistoryHeader
            title={t('history.title')}
            showAllUsers={false}
            setShowAllUsers={() => undefined}
            canManageResources={false}
          />
        </CardHeader>
        <CardBody>
          <Table
            aria-label={t('history.title')}
            shadow="none"
            removeWrapper
            data-cy="project-usage-history-table"
            bottomContent={
              data?.total ? (
                <Pagination
                  page={page}
                  total={totalPages}
                  showControls
                  onChange={(nextPage) => setPage(nextPage)}
                  className="justify-center"
                />
              ) : null
            }
          >
            <TableHeader>
              <TableColumn>{t('history.columns.resource')}</TableColumn>
              <TableColumn>{t('history.columns.user')}</TableColumn>
              <TableColumn>{t('history.columns.start')}</TableColumn>
              <TableColumn>{t('history.columns.end')}</TableColumn>
              <TableColumn>{t('history.columns.duration')}</TableColumn>
            </TableHeader>
            <TableBody
              items={data?.data ?? []}
              loadingState={loadingState}
              loadingContent={<TableDataLoadingIndicator />}
              emptyContent={<EmptyState message={t('history.empty')} />}
            >
              {(session: ResourceUsage) => (
                <TableRow
                  key={session.id}
                  className="cursor-pointer hover:bg-primary-50 transition-bg duration-300"
                  onClick={() => handleRowAction(session)}
                >
                  <TableCell>{session.resource?.name ?? '—'}</TableCell>
                  <TableCell>
                    <AttraccessUser user={session.user} />
                  </TableCell>
                  <TableCell>
                    <DateTimeDisplay date={session.startTime} />
                  </TableCell>
                  <TableCell>
                    {session.endTime ? <DateTimeDisplay date={session.endTime} /> : t('history.inProgress')}
                  </TableCell>
                  <TableCell>
                    {session.usageInMinutes >= 0
                      ? t('history.minutes', { count: Math.round(session.usageInMinutes) })
                      : t('history.inProgress')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardBody>
      </Card>

      <UsageNotesModal isOpen={isModalOpen} onClose={closeModal} session={selectedSession} />
    </>
  );
}
