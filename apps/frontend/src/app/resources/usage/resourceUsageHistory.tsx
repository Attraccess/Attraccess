import { HTMLAttributes, useCallback, useMemo, useRef, useState } from 'react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useAuth } from '../../../hooks/useAuth';
import { History } from 'lucide-react';
import {
  ResourceUsage,
  useResourcesServiceResourceUsageUpdateSessionProject,
  UseResourcesServiceResourceUsageGetHistoryKeyFn,
} from '@attraccess/react-query-client';
import { HistoryTable } from './components/HistoryTable';
import { UsageNotesModal } from './components/UsageNotesModal';
import { ShowAllUsersToggle } from './components/ShowAllUsersToggle';
import { useQueryClient } from '@tanstack/react-query';
import { useToastMessage } from '../../../components/toastProvider';
import en from './translations/resourceUsageHistory.en';
import de from './translations/resourceUsageHistory.de';
import historyTableEn from './components/HistoryTable/utils/translations/en.json';
import historyTableDe from './components/HistoryTable/utils/translations/de.json';
import { FlatSection } from '../../../components/flatSection';
import { useCanViewOperatingDuration, useOperatingDuration } from '../operatingDuration';

type ResourceUsageHistoryProps = Omit<HTMLAttributes<HTMLElement>, 'children'> & {
  resourceId: number;
  hideHeader?: boolean;
};

export function ResourceUsageHistory({ resourceId, hideHeader, ...rest }: ResourceUsageHistoryProps) {
  const { t } = useTranslations({ en, de });
  const { t: tHistoryTable } = useTranslations({ en: historyTableEn, de: historyTableDe });
  const { hasPermission } = useAuth();
  const canUpdateResources = hasPermission('resources.update');
  const canViewOperatingDuration = useCanViewOperatingDuration(resourceId);
  const queryClient = useQueryClient();
  const toast = useToastMessage();

  const [showAllUsers, setShowAllUsers] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<ResourceUsage | null>(null);
  const [projectOverrides, setProjectOverrides] = useState<Record<number, number | null>>({});
  const [updatingSessionIds, setUpdatingSessionIds] = useState<Record<number, boolean>>({});
  const previousProjectAssignmentsRef = useRef<Record<number, number | null>>({});
  const selectedSessionRange = useMemo(
    () =>
      selectedSession?.endTime
        ? { start: new Date(selectedSession.startTime), end: new Date(selectedSession.endTime) }
        : undefined,
    [selectedSession],
  );
  const { data: selectedOperatingDuration } = useOperatingDuration(
    resourceId,
    canViewOperatingDuration && selectedSession !== null,
    selectedSessionRange,
  );

  const projectPlaceholder = tHistoryTable('rows.machine.project.unassigned');
  const projectLabel = tHistoryTable('headers.machine.project');

  const handleSessionClick = (session: ResourceUsage) => {
    setSelectedSession(session);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

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
      toast.success({ title: tHistoryTable('rows.machine.project.updateSuccess') });
    },
    onError: (_error, variables) => {
      const previousProjectId = previousProjectAssignmentsRef.current[variables.usageId] ?? null;
      setProjectOverrides((prev) => ({
        ...prev,
        [variables.usageId]: previousProjectId,
      }));
      toast.error({ title: tHistoryTable('rows.machine.project.updateError') });
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

  const showAllUsersToggle = canUpdateResources ? (
    <ShowAllUsersToggle showAllUsers={showAllUsers} setShowAllUsers={setShowAllUsers} />
  ) : undefined;

  const table = (
    <HistoryTable
      resourceId={resourceId}
      showAllUsers={showAllUsers}
      canUpdateResources={canUpdateResources}
      onSessionClick={handleSessionClick}
      projectPlaceholder={projectPlaceholder}
      resolveProjectId={resolveProjectId}
      updatingSessionIds={updatingSessionIds}
      onProjectChange={handleProjectChange}
      canViewOperatingDuration={canViewOperatingDuration}
    />
  );

  const notesModal = (
    <UsageNotesModal
      isOpen={isModalOpen}
      onClose={handleCloseModal}
      session={selectedSession}
      projectLabel={projectLabel}
      projectPlaceholder={projectPlaceholder}
      resolveProjectId={resolveProjectId}
      updatingSessionIds={updatingSessionIds}
      onProjectChange={handleProjectChange}
      operatingDurationMs={
        selectedSession && canViewOperatingDuration
          ? selectedOperatingDuration?.attributions
              .filter((attribution) => attribution.usageId === selectedSession.id)
              .reduce((total, attribution) => total + attribution.durationMs, 0)
          : undefined
      }
    />
  );

  if (hideHeader) {
    return (
      <section {...rest}>
        {showAllUsersToggle ? <div className="flex justify-end mb-4">{showAllUsersToggle}</div> : null}
        {table}
        {notesModal}
      </section>
    );
  }

  return (
    <FlatSection
      icon={<History className="w-4 h-4" />}
      title={t('usageHistory')}
      actions={showAllUsersToggle}
      {...rest}
    >
      {table}
      {notesModal}
    </FlatSection>
  );
}
