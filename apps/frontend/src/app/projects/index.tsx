import { useProjectsServiceFindManyProjects } from '@attraccess/react-query-client';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import { PageHeader } from '../../components/pageHeader';
import { Button, Skeleton } from '@heroui/react';
import { FolderIcon, PlusIcon } from 'lucide-react';
import { UpsertProjectModal } from './upsertModal';
import { EmptyState } from '../../components/emptyState';
import { ProjectCard } from './projectCard';

export function ProjectsListPage() {
  const page = 1;
  const { data: projects, isLoading } = useProjectsServiceFindManyProjects({
    page,
  });

  const { t } = useTranslations({ en, de });

  return (
    <div>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        icon={<FolderIcon />}
        actions={
          <UpsertProjectModal>
            {(onOpen) => (
              <Button onPress={onOpen} startContent={<PlusIcon size="24" />} variant="light">
                {t('actions.create')}
              </Button>
            )}
          </UpsertProjectModal>
        }
      />

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
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>
    </div>
  );
}
