import {
  ApiError,
  ProjectInvitationsServiceAcceptProjectInvitationMutationResult,
  ProjectInvitationsServiceDeclineProjectInvitationMutationResult,
  UseProjectInvitationsServiceListMyProjectInvitationsKeyFn,
  useProjectInvitationsServiceAcceptProjectInvitation,
  useProjectInvitationsServiceDeclineProjectInvitation,
  useProjectInvitationsServiceListMyProjectInvitations,
  useProjectsServiceFindManyProjects,
  useProjectsServiceFindManyProjectsKey,
} from '@attraccess/react-query-client';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import API_ERROR_TRANSLATIONS_EN from '../../global-translations/api-errors.en.json';
import API_ERROR_TRANSLATIONS_DE from '../../global-translations/api-errors.de.json';
import { PageHeader } from '../../components/pageHeader';
import { Card, Chip, Skeleton } from '@heroui/react';
import { Button } from '../../components/button';
import { LabeledSwitch } from '../../components/labeledSwitch';
import { FolderIcon, PlusIcon } from 'lucide-react';
import { UpsertProjectModal } from './upsertModal';
import { EmptyState } from '../../components/emptyState';
import { ProjectCard } from './projectCard';
import { useToastMessage } from '../../components/toastProvider';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

export function ProjectsListPage() {
  const page = 1;
  const [includeArchived, setIncludeArchived] = useState(false);
  const { data: projects, isLoading } = useProjectsServiceFindManyProjects({
    page,
    includeArchived,
  });
  const { data: invitations, isLoading: isLoadingInvitations } = useProjectInvitationsServiceListMyProjectInvitations();
  const { t, tExists } = useTranslations({
    en: { ...en, api: API_ERROR_TRANSLATIONS_EN },
    de: { ...de, api: API_ERROR_TRANSLATIONS_DE },
  });
  const toast = useToastMessage();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const invitationRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [highlightedInvitationId, setHighlightedInvitationId] = useState<number | null>(null);
  const [acceptingInvitationId, setAcceptingInvitationId] = useState<number | null>(null);
  const [decliningInvitationId, setDecliningInvitationId] = useState<number | null>(null);

  const hasInvitations = (invitations?.length ?? 0) > 0;

  const invalidateInvitations = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: UseProjectInvitationsServiceListMyProjectInvitationsKeyFn(),
      }),
      queryClient.invalidateQueries({
        queryKey: [useProjectsServiceFindManyProjectsKey],
      }),
    ]);
  }, [queryClient]);

  const { mutateAsync: acceptInvitation } = useProjectInvitationsServiceAcceptProjectInvitation<
    ProjectInvitationsServiceAcceptProjectInvitationMutationResult,
    ApiError
  >({
    onSuccess: () => {
      toast.success({ title: t('invitations.success.accept') });
      invalidateInvitations();
    },
    onError: (error) => {
      toast.apiError({ error, t, tExists, baseTranslationKey: 'api' });
    },
    onSettled: () => setAcceptingInvitationId(null),
  });

  const { mutateAsync: declineInvitation } = useProjectInvitationsServiceDeclineProjectInvitation<
    ProjectInvitationsServiceDeclineProjectInvitationMutationResult,
    ApiError
  >({
    onSuccess: () => {
      toast.success({ title: t('invitations.success.decline') });
      invalidateInvitations();
    },
    onError: (error) => {
      toast.apiError({ error, t, tExists, baseTranslationKey: 'api' });
    },
    onSettled: () => setDecliningInvitationId(null),
  });

  const handleAccept = useCallback(
    async (invitationId: number) => {
      setAcceptingInvitationId(invitationId);
      await acceptInvitation({ invitationId });
    },
    [acceptInvitation],
  );

  const handleDecline = useCallback(
    async (invitationId: number) => {
      setDecliningInvitationId(invitationId);
      await declineInvitation({ invitationId });
    },
    [declineInvitation],
  );

  useEffect(() => {
    const target = searchParams.get('invitationId');
    if (!target) {
      return;
    }
    const invitationId = Number(target);
    if (!invitationId || Number.isNaN(invitationId) || !hasInvitations) {
      return;
    }
    const ref = invitationRefs.current[invitationId];
    if (ref) {
      ref.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedInvitationId(invitationId);
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('invitationId');
      setSearchParams(nextParams, { replace: true });
    }
  }, [hasInvitations, searchParams, setSearchParams]);

  useEffect(() => {
    if (!highlightedInvitationId) {
      return;
    }
    const timeout = setTimeout(() => setHighlightedInvitationId(null), 4000);
    return () => clearTimeout(timeout);
  }, [highlightedInvitationId]);

  const invitationContent = useMemo(() => {
    if (isLoadingInvitations && !hasInvitations) {
      return (
        <>
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </>
      );
    }

    if (!hasInvitations) {
      return <p className="text-small text-default-500">{t('invitations.empty')}</p>;
    }

    return invitations?.map((invitation) => (
      <div
        key={invitation.id}
        ref={(el) => {
          invitationRefs.current[invitation.id] = el;
        }}
        className={`flex flex-col gap-3 rounded-medium border border-default-200 p-3 transition-all ${
          highlightedInvitationId === invitation.id ? 'border-primary ring-2 ring-primary/60' : ''
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium">{invitation.project?.name ?? '—'}</p>
            <p className="text-small text-default-500">
              {t('invitations.invitedBy', { username: invitation.inviter?.username ?? '—' })}
            </p>
          </div>
          <Chip variant="soft">
            {t(`invitations.roles.${invitation.requestedRole}` as const)}
          </Chip>
        </div>
        <div className="text-tiny text-default-400">{new Date(invitation.createdAt).toLocaleString()}</div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="primary"

            isPending={acceptingInvitationId === invitation.id}
            onPress={() => handleAccept(invitation.id)}
          >
            {t('invitations.actions.accept')}
          </Button>
          <Button variant="danger-soft"

            isPending={decliningInvitationId === invitation.id}
            onPress={() => handleDecline(invitation.id)}
          >
            {t('invitations.actions.decline')}
          </Button>
        </div>
      </div>
    ));
  }, [
    acceptingInvitationId,
    decliningInvitationId,
    handleAccept,
    handleDecline,
    hasInvitations,
    highlightedInvitationId,
    invitations,
    isLoadingInvitations,
    t,
  ]);

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
              <UpsertProjectModal>
                {(onOpen) => <Button {...triggerProps} onPress={onOpen} />}
              </UpsertProjectModal>
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
