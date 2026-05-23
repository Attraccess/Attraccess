import { HTMLAttributes, useCallback, useRef, useState } from 'react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useAuth } from '../../../hooks/useAuth';
import { Checkbox } from '@heroui/react';
import { History, Users } from 'lucide-react';
import {
  ResourceUsage,
  useResourcesServiceResourceUsageUpdateSessionProject,
  UseResourcesServiceResourceUsageGetHistoryKeyFn,
} from '@attraccess/react-query-client';
import { HistoryTable } from './components/HistoryTable';
import { UsageNotesModal } from './components/UsageNotesModal';
import { useQueryClient } from '@tanstack/react-query';
import { useToastMessage } from '../../../components/toastProvider';
import en from './translations/resourceUsageHistory.en';
import de from './translations/resourceUsageHistory.de';
import historyTableEn from './components/HistoryTable/utils/translations/en.json';
import historyTableDe from './components/HistoryTable/utils/translations/de.json';
import historyHeaderEn from './components/HistoryHeader/translations/en';
import historyHeaderDe from './components/HistoryHeader/translations/de';
import { FlatSection } from '../details/flatSection';

type ResourceUsageHistoryProps = Omit<HTMLAttributes<HTMLElement>, 'children'> & {
  resourceId: number;
};

export function ResourceUsageHistory({ resourceId, ...rest }: ResourceUsageHistoryProps) {
  const { t } = useTranslations({ en, de });
  const { t: tHistoryTable } = useTranslations({ en: historyTableEn, de: historyTableDe });
  const { t: tHistoryHeader } = useTranslations({ en: historyHeaderEn, de: historyHeaderDe });
  const { hasPermission } = useAuth();
  const canManageResources = hasPermission('canManageResources');
  const queryClient = useQueryClient();
  const toast = useToastMessage();

  const [showAllUsers, setShowAllUsers] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<ResourceUsage | null>(null);
  const [projectOverrides, setProjectOverrides] = useState<Record<number, number | null>>({});
  const [updatingSessionIds, setUpdatingSessionIds] = useState<Record<number, boolean>>({});
  const previousProjectAssignmentsRef = useRef<Record<number, number | null>>({});

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

  const showAllUsersToggle = canManageResources ? (
    <div className="flex items-center">
      <Checkbox isSelected={showAllUsers} onChange={setShowAllUsers} />
      <span className="ml-2 text-sm flex items-center">
        <Users className="w-4 h-4 mr-1" /> {tHistoryHeader('showAllUsers')}
      </span>
    </div>
  ) : undefined;

  return (
    <FlatSection
      icon={<History className="w-4 h-4" />}
      title={t('usageHistory')}
      actions={showAllUsersToggle}
      {...rest}
    >
      <HistoryTable
        resourceId={resourceId}
        showAllUsers={showAllUsers}
        canManageResources={canManageResources}
        onSessionClick={handleSessionClick}
        projectPlaceholder={projectPlaceholder}
        resolveProjectId={resolveProjectId}
        updatingSessionIds={updatingSessionIds}
        onProjectChange={handleProjectChange}
      />

      <UsageNotesModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        session={selectedSession}
        projectLabel={projectLabel}
        projectPlaceholder={projectPlaceholder}
        resolveProjectId={resolveProjectId}
        updatingSessionIds={updatingSessionIds}
        onProjectChange={handleProjectChange}
      />
    </FlatSection>
  );
}
