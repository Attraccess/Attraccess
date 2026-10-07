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
import { Chip, Skeleton } from '@heroui/react';
import { useToastMessage } from '../../components/toastProvider';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { useInvitationHighlight } from './useInvitationHighlight';
import { Button } from '../../components/button';

export function useProjectsListPageState() {
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
  const [acceptingInvitationId, setAcceptingInvitationId] = useState<number | null>(null);
  const [decliningInvitationId, setDecliningInvitationId] = useState<number | null>(null);

  const hasInvitations = (invitations?.length ?? 0) > 0;
  const { invitationRefs, highlightedInvitationId } = useInvitationHighlight(hasInvitations);

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
          <Chip variant="soft">{t(`invitations.roles.${invitation.requestedRole}` as const)}</Chip>
        </div>
        <div className="text-tiny text-default-400">{new Date(invitation.createdAt).toLocaleString()}</div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            variant="primary"

            isPending={acceptingInvitationId === invitation.id}
            onPress={() => handleAccept(invitation.id)}
          >
            {t('invitations.actions.accept')}
          </Button>
          <Button
            variant="danger-soft"

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
    invitationRefs,
    isLoadingInvitations,
    t,
  ]);
  return {
    includeArchived,
    setIncludeArchived,
    projects,
    isLoading,
    isLoadingInvitations,
    t,
    hasInvitations,
    invitationContent,
  } as const;
}
