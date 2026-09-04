import { useCallback, useMemo, useState } from 'react';
import { Table, TableScrollContainer, TableContent, TableHeader, TableBody, TableRow } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { generateHeaderColumns } from './utils/tableHeaders';
import { generateRowCells } from './utils/tableRows';
import {
  useResourcesServiceResourceUsageGetHistory,
  ResourceUsage,
  useResourcesServiceGetOneResourceById,
  ResourceType,
  ResourceUsageAction,
} from '@attraccess/react-query-client';
import { useAuth } from '../../../../../hooks/useAuth';
import { EmptyState } from '../../../../../components/emptyState';
import { ProjectsSelect } from '../../../../../components/projectsSelect';
import en from './utils/translations/en.json';
import de from './utils/translations/de.json';
import { SimplePagination } from '../../../../../components/simplePagination';
import { useOperatingDuration } from '../../../operatingDuration';

interface HistoryTableProps {
  resourceId: number;
  showAllUsers?: boolean;
  canUpdateResources: boolean;
  onSessionClick: (session: ResourceUsage) => void;
  projectPlaceholder: string;
  resolveProjectId: (session: ResourceUsage) => number | null;
  updatingSessionIds: Record<number, boolean>;
  onProjectChange: (session: ResourceUsage, projectId: number | undefined) => void;
  canViewOperatingDuration: boolean;
}

interface ProjectAssignmentCellProps {
  session: ResourceUsage;
  canEdit: boolean;
  projectId: number | null;
  isUpdating: boolean;
  placeholder: string;
  unassignedLabel: string;
  onChange: (projectId: number | undefined) => void;
}

const ProjectAssignmentCell = ({
  session,
  canEdit,
  projectId,
  isUpdating,
  placeholder,
  unassignedLabel,
  onChange,
}: ProjectAssignmentCellProps) => {
  if (!canEdit) {
    return <span>{session.project?.name ?? placeholder}</span>;
  }

  return (
    <div onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
      <ProjectsSelect
        value={projectId ?? undefined}
        onChange={onChange}
        placeholder={placeholder}
        includeUnassignedOption
        unassignedLabel={unassignedLabel}
        isDisabled={isUpdating}
      />
    </div>
  );
};

export const HistoryTable = ({
  resourceId,
  showAllUsers = false,
  canUpdateResources,
  onSessionClick,
  projectPlaceholder,
  resolveProjectId,
  updatingSessionIds,
  onProjectChange,
  canViewOperatingDuration,
}: HistoryTableProps) => {
  const { t } = useTranslations({ en, de });
  const { user } = useAuth();

  const [page, setPage] = useState(1);
  const [rowsPerPage] = useState(5);

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
  }, []);

  const { data: usageHistory, error } = useResourcesServiceResourceUsageGetHistory(
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

    return generateHeaderColumns(t, resource, showAllUsers, canUpdateResources, canViewOperatingDuration);
  }, [t, showAllUsers, canUpdateResources, canViewOperatingDuration, resource]);

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
        case ResourceType.MACHINE:
          return session.usageAction === ResourceUsageAction.USAGE;
        case ResourceType.DOOR:
          return (
            session.usageAction === ResourceUsageAction.DOOR_LOCK ||
            session.usageAction === ResourceUsageAction.DOOR_UNLOCK ||
            session.usageAction === ResourceUsageAction.DOOR_UNLATCH
          );
        default: {
          const exhaustiveCheck: never = resource?.type;
          throw new Error(`Unknown resource type: ${exhaustiveCheck}`);
        }
      }
    });
  }, [usageHistory?.data, resource]);

  const operatingDurationRange = useMemo(() => {
    if (resource?.type !== ResourceType.MACHINE || filteredHistory.length === 0) {
      return undefined;
    }

    return {
      start: new Date(Math.min(...filteredHistory.map((session) => new Date(session.startTime).getTime()))),
      end: new Date(
        Math.max(...filteredHistory.map((session) => new Date(session.endTime ?? new Date()).getTime())),
      ),
    };
  }, [filteredHistory, resource?.type]);
  const { data: operatingDurationForPage } = useOperatingDuration(
    resourceId,
    canViewOperatingDuration && operatingDurationRange !== undefined,
    operatingDurationRange,
  );

  if (error) {
    return <div className="text-center py-4 text-red-500">{t('errorLoadingHistory')}</div>;
  }

  return (
    <>
      <Table data-cy="resource-usage-history-table">
        <TableScrollContainer>
          <TableContent aria-label={t('table.ariaLabel')}>
            <TableHeader>{headerColumns}</TableHeader>
            <TableBody renderEmptyState={() => <EmptyState />}>
              {filteredHistory.map((session: ResourceUsage) => (
                <TableRow
                  key={session.id}
                  id={session.id}
                  className="cursor-pointer hover:bg-primary-50 transition-bg duration-300"
                  onAction={() => onSessionClick(session)}
                >
                  {resource
                    ? generateRowCells(
                        session,
                        t,
                        resource,
                        showAllUsers,
                        canUpdateResources,
                        (sessionToRender) => (
                          <ProjectAssignmentCell
                            session={sessionToRender}
                            canEdit={Boolean(sessionToRender.endTime) && sessionToRender.userId === user?.id}
                            projectId={resolveProjectId(sessionToRender)}
                            isUpdating={Boolean(updatingSessionIds[sessionToRender.id])}
                            placeholder={projectPlaceholder}
                            unassignedLabel={projectPlaceholder}
                            onChange={(projectId) => onProjectChange(sessionToRender, projectId)}
                          />
                        ),
                        {
                          canView: canViewOperatingDuration,
                          durationMs: operatingDurationForPage?.attributions
                            .filter((attribution) => attribution.usageId === session.id)
                            .reduce((total, attribution) => total + attribution.durationMs, 0),
                        },
                      )
                    : []}
                </TableRow>
              ))}
            </TableBody>
          </TableContent>
        </TableScrollContainer>
      </Table>
      <SimplePagination total={totalPages} page={page} onChange={handlePageChange} />
    </>
  );
};
