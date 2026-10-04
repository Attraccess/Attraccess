import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  ResourceUsage,
  useResourcesServiceResourceUsageUpdateSessionProject,
  UseResourcesServiceResourceUsageGetHistoryKeyFn,
  UseResourcesServiceResourceUsageGetSessionKeyFn,
  useProjectsServiceGetProjectUsageHistoryKey,
} from '@attraccess/react-query-client';
import { useToastMessage } from '../../../../components/toastProvider';
import en from '../components/HistoryTable/utils/translations/en.json';
import de from '../components/HistoryTable/utils/translations/de.json';

export function useUsageSessionProject(resourceId: number) {
  const { t: tHistoryTable } = useTranslations({ en, de });
  const queryClient = useQueryClient();
  const toast = useToastMessage();
  const [projectOverrides, setProjectOverrides] = useState<Record<number, number | null>>({});
  const [updatingSessionIds, setUpdatingSessionIds] = useState<Record<number, boolean>>({});
  const invalidateHistory = useCallback(() => {
    return queryClient.invalidateQueries({
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
    onSuccess: async (updatedUsage) => {
      await Promise.all([
        invalidateHistory(),
        queryClient.invalidateQueries({
          queryKey: UseResourcesServiceResourceUsageGetSessionKeyFn({ resourceId, usageId: updatedUsage.id }),
        }),
        queryClient.invalidateQueries({ queryKey: [useProjectsServiceGetProjectUsageHistoryKey] }),
      ]);
      setProjectOverrides((prev) => {
        const next = { ...prev };
        delete next[updatedUsage.id];
        return next;
      });
      toast.success({ title: tHistoryTable('rows.machine.project.updateSuccess') });
    },
    onError: (_error, variables) => {
      setProjectOverrides((prev) => {
        const next = { ...prev };
        delete next[variables.usageId];
        return next;
      });
      toast.error({ title: tHistoryTable('rows.machine.project.updateError') });
    },
    onSettled: (_data, _error, variables) => {
      if (!variables) {
        return;
      }

      setUpdatingSessionIds((prev) => {
        const next = { ...prev };
        delete next[variables.usageId];
        return next;
      });
    },
  });

  const handleProjectChange = useCallback(
    (session: ResourceUsage, projectId: number | undefined) => {
      const normalizedProjectId = projectId ?? null;
      const currentProjectId = resolveProjectId(session);

      if (currentProjectId === normalizedProjectId) {
        return;
      }

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

  return { resolveProjectId, updatingSessionIds, handleProjectChange };
}
