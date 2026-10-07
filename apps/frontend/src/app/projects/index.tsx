import { PageHeader } from '../../components/pageHeader';
import { Card, Skeleton } from '@heroui/react';
import { Button } from '../../components/button';
import { LabeledSwitch } from '../../components/labeledSwitch';
import { FolderIcon, PlusIcon } from 'lucide-react';
import { UpsertProjectModal } from './upsertModal';
import { EmptyState } from '../../components/emptyState';
import { ProjectCard } from './projectCard';
import { useProjectsListPageState } from './useProjectsListPageState';

export function ProjectsListPage() {
  const {
    includeArchived,
    setIncludeArchived,
    projects,
    isLoading,
    isLoadingInvitations,
    t,
    hasInvitations,
    invitationContent,
  } = useProjectsListPageState();

  return (
    <div>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        icon={<FolderIcon />}
        actions={[
          {
            key: 'create',
            label: t('actions.create'),
            icon: <PlusIcon size={18} />,
            variant: 'primary',
            renderTrigger: (triggerProps) => (
              <UpsertProjectModal>{(onOpen) => <Button {...triggerProps} onPress={onOpen} />}</UpsertProjectModal>
            ),
          },
        ]}
      />

      <div className="flex flex-wrap items-center justify-end gap-3 mb-4">
        <LabeledSwitch isSelected={includeArchived} onChange={setIncludeArchived}>
          {t('filters.includeArchived')}
        </LabeledSwitch>
      </div>

      {(isLoadingInvitations || hasInvitations) && (
        <Card className="mb-6">
          <Card.Header className="flex flex-col items-start gap-1">
            <p className="text-large font-semibold">{t('invitations.title')}</p>
            <p className="text-small text-default-500">{t('invitations.description')}</p>
          </Card.Header>
          <Card.Content className="space-y-3">{invitationContent}</Card.Content>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-4">
        {!projects && isLoading && (
          <>
            <Skeleton className="w-full h-24" />
            <Skeleton className="w-full h-24" />
            <Skeleton className="w-full h-24" />
          </>
        )}
        {projects?.data?.length === 0 && !isLoading && <EmptyState />}
        {projects?.data?.map((project) => (
          <ProjectCard key={project.id} project={project} archivedLabel={t('filters.archivedBadge')} />
        ))}
      </div>
    </div>
  );
}
