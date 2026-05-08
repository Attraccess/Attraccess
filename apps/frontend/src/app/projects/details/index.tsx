import {
  ApiError,
  useProjectsServiceArchiveProject,
  useProjectsServiceDeleteOneProject,
  useProjectsServiceFindManyProjectsKey,
  useProjectsServiceFindOneProject,
  useProjectsServiceFindOneProjectKey,
  useProjectsServiceUnarchiveProject,
} from '@attraccess/react-query-client';
import { Skeleton, Button, Link, Chip } from '@heroui/react';
import { filenameToUrl } from '../../../api';
import { PageHeader } from '../../../components/pageHeader';
import { ArchiveIcon, ArchiveRestoreIcon, Edit2Icon, FoldersIcon, Trash2Icon, UsersIcon } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { DeleteConfirmationModal } from '../../../components/deleteConfirmationModal';
import { useCallback, useState } from 'react';
import { useToastMessage } from '../../../components/toastProvider';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../global-translations/api-errors.en.json';
import API_ERROR_TRANSLATIONS_DE from '../../../global-translations/api-errors.de.json';
import { UpsertProjectModal } from '../upsertModal';
import { ProjectSummaryCards } from './components/projectSummaryCards';
import { ProjectUsageCharts } from './components/projectUsageCharts';
import { ProjectUsageHistory } from './components/projectUsageHistory';
export function ProjectDetailsPage() {
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

  return (
    <>
      <PageHeader
        title={
          project ? (
            <span className="flex items-center gap-2">
              {project.name}
              {project.archivedAt && (
                <Chip size="sm" variant="flat" color="warning" startContent={<ArchiveIcon className="size-3" />}>
                  {t('archivedBadge')}
                </Chip>
              )}
            </span>
          ) : (
            <Skeleton className="w-full h-4" />
          )
        }
        subtitle={project?.description ?? <Skeleton className="w-full h-4" />}
        icon={
          project?.logo ? (
            <img className="max-w-12 max-h-12" src={filenameToUrl(project.logo)} alt={project?.name} />
          ) : (
            <FoldersIcon />
          )
        }
        backTo="/projects"
        actions={
          project?.access.isOwner && (
            <>
              <Button
                variant="light"
                as={Link}
                href={`/projects/${projectId}/team`}
                startContent={<UsersIcon className="size-4" />}
              >
                {t('actions.members.label')}
              </Button>
              <UpsertProjectModal projectId={projectId}>
                {(onOpen) => (
                  <Button onPress={onOpen} startContent={<Edit2Icon className="size-4" />} variant="light">
                    {t('actions.update.label')}
                  </Button>
                )}
              </UpsertProjectModal>
              {project.archivedAt ? (
                <Button
                  onPress={() => unarchiveProject({ id: projectId })}
                  startContent={<ArchiveRestoreIcon className="size-4" />}
                  variant="light"
                  color="warning"
                  isLoading={isUnarchiving}
                >
                  {t('actions.unarchive.label')}
                </Button>
              ) : (
                <Button
                  onPress={() => archiveProject({ id: projectId })}
                  startContent={<ArchiveIcon className="size-4" />}
                  variant="light"
                  color="warning"
                  isLoading={isArchiving}
                >
                  {t('actions.archive.label')}
                </Button>
              )}
              <Button
                onPress={() => setShowDeleteConfirmationModal(true)}
                startContent={<Trash2Icon className="size-4" />}
                color="danger"
                variant="light"
              >
                {t('actions.delete.label')}
              </Button>
            </>
          )
        }
      />

      <DeleteConfirmationModal
        isOpen={showDeleteConfirmationModal}
        onClose={() => setShowDeleteConfirmationModal(false)}
        onConfirm={onDeleteProject}
        itemName={project?.name ?? ''}
      />

      {hasValidProjectId && (
        <div className="space-y-6 mt-6">
          <ProjectSummaryCards projectId={projectId} />
          <ProjectUsageCharts projectId={projectId} />
          <ProjectUsageHistory projectId={projectId} />
        </div>
      )}
    </>
  );
}
