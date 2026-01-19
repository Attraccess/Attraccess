import { useCallback, useMemo, useRef, useState } from 'react';
import { Table, TableHeader, TableBody, TableRow, Pagination } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { generateHeaderColumns } from './utils/tableHeaders';
import { generateRowCells } from './utils/tableRows';
import {
  useResourcesServiceResourceUsageGetHistory,
  ResourceUsage,
  useResourcesServiceGetOneResourceById,
  ResourceType,
  ResourceUsageAction,
  useResourcesServiceResourceUsageUpdateSessionProject,
  UseResourcesServiceResourceUsageGetHistoryKeyFn,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../../../hooks/useAuth';
import { TableDataLoadingIndicator } from '../../../../../components/tableComponents';
import { EmptyState } from '../../../../../components/emptyState';
import { useReactQueryStatusToHeroUiTableLoadingState } from '../../../../../hooks/useReactQueryStatusToHeroUiTableLoadingState';
import { useToastMessage } from '../../../../../components/toastProvider';
import { ProjectsSelect } from '../../../../../components/projectsSelect';
import en from './utils/translations/en.json';
import de from './utils/translations/de.json';

interface HistoryTableProps {
  resourceId: number;
  showAllUsers?: boolean;
  canManageResources: boolean;
  onSessionClick: (session: ResourceUsage) => void;
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
        onValueChange={onChange}
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
  canManageResources,
  onSessionClick,
}: HistoryTableProps) => {
  const { t } = useTranslations({ en, de });
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToastMessage();

  const [projectOverrides, setProjectOverrides] = useState<Record<number, number | null>>({});
  const [updatingSessionIds, setUpdatingSessionIds] = useState<Record<number, boolean>>({});
  const previousProjectAssignmentsRef = useRef<Record<number, number | null>>({});

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

  const projectPlaceholder = t('rows.machine.project.unassigned');

  const headerColumns = useMemo(() => {
    if (!resource) {
      return [];
    }

    return generateHeaderColumns(t, resource, showAllUsers, canManageResources);
  }, [t, showAllUsers, canManageResources, resource]);

  const loadingState = useReactQueryStatusToHeroUiTableLoadingState(fetchStatus);

  const invalidateHistory = useCallback(() => {
    queryClient.invalidateQueries({
      predicate: (query) => {
        const baseHistoryKey = UseResourcesServiceResourceUsageGetHistoryKeyFn({ resourceId });
        return (
          query.queryKey[0] === baseHistoryKey[0] &&
          query.queryKey.length > 1 &&
          JSON.stringify(query.queryKey[1]).includes(`"resourceId":${resourceId}`)
        );
      },
    });
  }, [queryClient, resourceId]);

  const resolveProjectId = useCallback(
    (session: ResourceUsage) => {
      if (Object.prototype.hasOwnProperty.call(projectOverrides, session.id)) {
        return projectOverrides[session.id] ?? null;
      }

      return session.project?.id ?? null;
    },
    [projectOverrides],
  );

  const { mutate: updateSessionProject } = useResourcesServiceResourceUsageUpdateSessionProject({
    onSuccess: (updatedUsage) => {
      setProjectOverrides((prev) => ({
        ...prev,
        [updatedUsage.id]: updatedUsage.project?.id ?? null,
      }));
      invalidateHistory();
      toast.success({ title: t('rows.machine.project.updateSuccess') });
    },
    onError: (_error, variables) => {
      const previousProjectId = previousProjectAssignmentsRef.current[variables.usageId] ?? null;
      setProjectOverrides((prev) => ({
        ...prev,
        [variables.usageId]: previousProjectId,
      }));
      toast.error({ title: t('rows.machine.project.updateError') });
    },
    onSettled: (_data, _error, variables) => {
      if (!variables) {
        return;
      }

      setUpdatingSessionIds((prev) => {
        const { [variables.usageId]: _removed, ...rest } = prev;
        return rest;
      });
      delete previousProjectAssignmentsRef.current[variables.usageId];
    },
  });

  const handleProjectChange = useCallback(
    (session: ResourceUsage, projectId: number | undefined) => {
      const normalizedProjectId = projectId ?? null;
      const currentProjectId = resolveProjectId(session);

      if (currentProjectId === normalizedProjectId) {
        return;
      }

      previousProjectAssignmentsRef.current[session.id] = currentProjectId;
      setProjectOverrides((prev) => ({
        ...prev,
        [session.id]: normalizedProjectId,
      }));
      setUpdatingSessionIds((prev) => ({
        ...prev,
        [session.id]: true,
      }));

      updateSessionProject({
        resourceId,
        usageId: session.id,
        requestBody: { projectId: projectId ?? null },
      });
    },
    [resourceId, resolveProjectId, updateSessionProject],
  );

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

  if (error) {
    return <div className="text-center py-4 text-red-500">{t('errorLoadingHistory')}</div>;
  }

  return (
    <Table
      aria-label={t('table.ariaLabel')}
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
            {resource
              ? generateRowCells(session, t, resource, showAllUsers, canManageResources, (sessionToRender) => (
                  <ProjectAssignmentCell
                    session={sessionToRender}
                    canEdit={Boolean(sessionToRender.endTime) && sessionToRender.userId === user?.id}
                    projectId={resolveProjectId(sessionToRender)}
                    isUpdating={Boolean(updatingSessionIds[sessionToRender.id])}
                    placeholder={projectPlaceholder}
                    unassignedLabel={projectPlaceholder}
                    onChange={(projectId) => handleProjectChange(sessionToRender, projectId)}
                  />
                ))
              : []}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};
