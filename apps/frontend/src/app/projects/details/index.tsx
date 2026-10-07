import { Skeleton, Chip } from '@heroui/react';
import { Button } from '../../../components/button';
import { filenameToUrl } from '../../../api';
import { PageHeader, PageAction } from '../../../components/pageHeader';
import { ArchiveIcon, ArchiveRestoreIcon, Edit2Icon, FoldersIcon, Trash2Icon, UsersIcon } from 'lucide-react';
import { DeleteConfirmationModal } from '../../../components/deleteConfirmationModal';
import { UpsertProjectModal } from '../upsertModal';
import { ProjectSummaryCards } from './components/projectSummaryCards';
import { ProjectUsageCharts } from './components/projectUsageCharts';
import { ProjectUsageHistory } from './components/projectUsageHistory';
import { useProjectDetailsPageState } from './useProjectDetailsPageState';

export function ProjectDetailsPage() {
  const {
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
  } = useProjectDetailsPageState();

  return (
    <>
      <PageHeader
        title={
          project ? (
            <span className="flex items-center gap-2">
              {project.name}
              {project.archivedAt && (
                <Chip variant="soft" color="warning">
                  <ArchiveIcon className="size-3" />
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
          project?.access.isOwner
            ? ([
                {
                  key: 'members',
                  label: t('actions.members.label'),
                  icon: <UsersIcon className="size-4" />,
                  onPress: () => navigate(`/projects/${projectId}/team`),
                },
                {
                  key: 'update',
                  label: t('actions.update.label'),
                  icon: <Edit2Icon className="size-4" />,
                  renderTrigger: (triggerProps) => (
                    <UpsertProjectModal projectId={projectId}>
                      {(onOpen) => <Button {...triggerProps} onPress={onOpen} />}
                    </UpsertProjectModal>
                  ),
                },
                project.archivedAt
                  ? {
                      key: 'unarchive',
                      label: t('actions.unarchive.label'),
                      icon: <ArchiveRestoreIcon className="size-4" />,
                      isPending: isUnarchiving,
                      onPress: () => unarchiveProject({ id: projectId }),
                    }
                  : {
                      key: 'archive',
                      label: t('actions.archive.label'),
                      icon: <ArchiveIcon className="size-4" />,
                      isPending: isArchiving,
                      onPress: () => archiveProject({ id: projectId }),
                    },
                {
                  key: 'delete',
                  label: t('actions.delete.label'),
                  icon: <Trash2Icon className="size-4" />,
                  variant: 'destructive',
                  onPress: () => setShowDeleteConfirmationModal(true),
                },
              ] satisfies PageAction[])
            : undefined
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
