import { Image, Skeleton, Card, CardBody } from '@heroui/react';
import { useParams } from 'react-router-dom';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { PageHeader } from '../../../../components/pageHeader';
import { filenameToUrl } from '../../../../api';
import { FoldersIcon } from 'lucide-react';
import { useProjectsServiceFindOneProject } from '@attraccess/react-query-client';
import API_ERROR_TRANSLATIONS_EN from '../../../../global-translations/api-errors.en.json';
import API_ERROR_TRANSLATIONS_DE from '../../../../global-translations/api-errors.de.json';
import en from '../components/projectTeam/en.json';
import de from '../components/projectTeam/de.json';
import { TeamInviteCard } from '../components/projectTeam/TeamInviteCard';
import { TeamPendingInvitesCard } from '../components/projectTeam/TeamPendingInvitesCard';
import { TeamMembersCard } from '../components/projectTeam/TeamMembersCard';

export function ProjectTeamPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = parseInt(id ?? '', 10);
  const hasValidProjectId = Number.isFinite(projectId);

  const { t } = useTranslations({
    en: { ...en, api: API_ERROR_TRANSLATIONS_EN },
    de: { ...de, api: API_ERROR_TRANSLATIONS_DE },
  });

  const { data: project } = useProjectsServiceFindOneProject({ id: projectId }, undefined, {
    enabled: hasValidProjectId,
  });

  const isOwner = Boolean(project?.access?.isOwner);

  return (
    <>
      <PageHeader
        title={t('page.title')}
        subtitle={project?.name ?? <Skeleton className="h-4 w-full" />}
        icon={
          project?.logo ? (
            <Image className="max-w-12 max-h-12" src={filenameToUrl(project.logo)} alt={project?.name} />
          ) : (
            <FoldersIcon />
          )
        }
        backTo={hasValidProjectId ? `/projects/${projectId}` : '/projects'}
      />

      <div className="mt-6 space-y-6">
        {!isOwner && (
          <Card>
            <CardBody>
              <p className="text-small text-default-500">{t('messages.ownerOnly')}</p>
            </CardBody>
          </Card>
        )}
        <TeamInviteCard projectId={projectId} isOwner={isOwner} />
        <TeamPendingInvitesCard projectId={projectId} isOwner={isOwner} />
        <TeamMembersCard projectId={projectId} isOwner={isOwner} />
      </div>
    </>
  );
}
