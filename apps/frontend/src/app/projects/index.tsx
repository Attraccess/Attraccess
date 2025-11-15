import { useProjectsServiceFindManyProjects } from '@attraccess/react-query-client';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import { PageHeader } from '../../components/pageHeader';
import { Button, Card, CardBody, CardHeader, Image, Skeleton } from '@heroui/react';
import { FolderIcon, PlusIcon, ShapesIcon } from 'lucide-react';
import { CreateProjectModal } from './createModal';
import { filenameToUrl } from '../../api';
import { EmptyState } from '../../components/emptyState';

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
          <CreateProjectModal>
            {(onOpen) => (
              <Button onPress={onOpen} startContent={<PlusIcon size="24" />} variant="light">
                {t('actions.create')}
              </Button>
            )}
          </CreateProjectModal>
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
          <Card key={project.id}>
            <CardHeader>
              <PageHeader
                icon={
                  project.logo ? (
                    <Image
                      src={filenameToUrl(project.logo)}
                      alt={project.name}
                      width={48}
                      height={48}
                      classNames={{
                        img: 'object-contain',
                      }}
                    />
                  ) : (
                    <ShapesIcon size="48" />
                  )
                }
                title={project.name}
                noMargin
              />
            </CardHeader>

            <CardBody>
              <p>{project.description}</p>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
