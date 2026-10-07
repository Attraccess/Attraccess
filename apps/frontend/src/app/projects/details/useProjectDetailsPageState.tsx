import {
  ApiError,
  useProjectsServiceArchiveProject,
  useProjectsServiceDeleteOneProject,
  useProjectsServiceFindManyProjectsKey,
  useProjectsServiceFindOneProject,
  useProjectsServiceFindOneProjectKey,
  useProjectsServiceUnarchiveProject,
} from '@attraccess/react-query-client';
import { useNavigate, useParams } from 'react-router-dom';
import { useCallback, useState } from 'react';
import { useToastMessage } from '../../../components/toastProvider';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../global-translations/api-errors.en.json';
import API_ERROR_TRANSLATIONS_DE from '../../../global-translations/api-errors.de.json';

export function useProjectDetailsPageState() {
  const { id } = useParams<{ id: string }>();
  const projectId = parseInt(id || '', 10);
  const hasValidProjectId = Number.isFinite(projectId);

  const navigate = useNavigate();
  const toast = useToastMessage();
  const queryClient = useQueryClient();
  const { t, tExists } = useTranslations({
    en: {
      ...en,
      api: API_ERROR_TRANSLATIONS_EN,
    },
    de: {
      ...de,
      api: API_ERROR_TRANSLATIONS_DE,
    },
  });

  const { data: project } = useProjectsServiceFindOneProject({ id: projectId }, undefined, {
    enabled: hasValidProjectId,
  });
  const [showDeleteConfirmationModal, setShowDeleteConfirmationModal] = useState(false);

  const { mutate: deleteProject } = useProjectsServiceDeleteOneProject({
    onSuccess: () => {
      toast.success({
        title: t('actions.delete.success.title'),
        description: t('actions.delete.success.description', { name: project?.name ?? '' }),
      });
      queryClient.invalidateQueries({
        queryKey: [useProjectsServiceFindManyProjectsKey],
      });
      navigate('/projects');
    },
    onError: (error) => {
      toast.apiError({
        error: error as ApiError,
        t,
        tExists,
        baseTranslationKey: 'api',
      });
    },
  });

  const { mutate: archiveProject, isPending: isArchiving } = useProjectsServiceArchiveProject({
    onSuccess: () => {
      toast.success({
        title: t('actions.archive.success.title'),
        description: t('actions.archive.success.description', { name: project?.name ?? '' }),
      });
      queryClient.invalidateQueries({
        queryKey: [useProjectsServiceFindManyProjectsKey],
      });
      queryClient.invalidateQueries({
        queryKey: [useProjectsServiceFindOneProjectKey],
      });
    },
    onError: (error) => {
      toast.apiError({
        error: error as ApiError,
        t,
        tExists,
        baseTranslationKey: 'api',
      });
    },
  });

  const { mutate: unarchiveProject, isPending: isUnarchiving } = useProjectsServiceUnarchiveProject({
    onSuccess: () => {
      toast.success({
        title: t('actions.unarchive.success.title'),
        description: t('actions.unarchive.success.description', { name: project?.name ?? '' }),
      });
      queryClient.invalidateQueries({
        queryKey: [useProjectsServiceFindManyProjectsKey],
      });
      queryClient.invalidateQueries({
        queryKey: [useProjectsServiceFindOneProjectKey],
      });
    },
    onError: (error) => {
      toast.apiError({
        error: error as ApiError,
        t,
        tExists,
        baseTranslationKey: 'api',
      });
    },
  });

  const onDeleteProject = useCallback(() => {
    deleteProject({ id: projectId });
  }, [deleteProject, projectId]);
  return {
    id,
    projectId,
    hasValidProjectId,
    navigate,
    t,
    project,
    showDeleteConfirmationModal,
    setShowDeleteConfirmationModal,
    archiveProject,
    isArchiving,
    unarchiveProject,
    isUnarchiving,
    onDeleteProject,
  } as const;
}
