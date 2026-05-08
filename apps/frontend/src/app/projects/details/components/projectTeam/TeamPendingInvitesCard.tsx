import { useCallback, useMemo, useState } from 'react';
import { Button, Card, CardContent, CardHeader, Chip, Skeleton } from '@heroui/react';
import {
  ApiError,
  ProjectInvitation,
  ProjectsServiceCancelProjectInvitationMutationResult,
  ProjectsServiceResendProjectInvitationMutationResult,
  UseProjectsServiceListProjectInvitationsKeyFn,
  useProjectsServiceCancelProjectInvitation,
  useProjectsServiceListProjectInvitations,
  useProjectsServiceResendProjectInvitation,
} from '@attraccess/react-query-client';
import { AttraccessUser, useTranslations } from '@attraccess/plugins-frontend-ui';
import { RefreshCcwIcon, XIcon } from 'lucide-react';
import { useToastMessage } from '../../../../../components/toastProvider';
import { useQueryClient } from '@tanstack/react-query';
import API_ERROR_TRANSLATIONS_EN from '../../../../../global-translations/api-errors.en.json';
import API_ERROR_TRANSLATIONS_DE from '../../../../../global-translations/api-errors.de.json';
import en from './en.json';
import de from './de.json';

type TeamPendingInvitesCardProps = {
  projectId: number;
  isOwner: boolean;
};

export function TeamPendingInvitesCard(props: Readonly<TeamPendingInvitesCardProps>) {
  const { projectId, isOwner } = props;
  const [resendingId, setResendingId] = useState<number | null>(null);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const toast = useToastMessage();
  const queryClient = useQueryClient();

  const { t, tExists } = useTranslations({
    en: { ...en, api: API_ERROR_TRANSLATIONS_EN },
    de: { ...de, api: API_ERROR_TRANSLATIONS_DE },
  });

  const { data: invitations, isLoading } = useProjectsServiceListProjectInvitations({ id: projectId }, undefined, {
    enabled: isOwner,
  });

  const pendingInvitations = useMemo(
    () => (invitations ?? []).filter((invitation) => invitation.status === 'pending'),
    [invitations],
  );

  const invalidateInvitations = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: UseProjectsServiceListProjectInvitationsKeyFn({ id: projectId }),
    });
  }, [projectId, queryClient]);

  const { mutateAsync: resendInvitation } = useProjectsServiceResendProjectInvitation<
    ProjectsServiceResendProjectInvitationMutationResult,
    ApiError
  >({
    onSuccess: () => {
      toast.success({ title: t('success.resend') });
      invalidateInvitations();
    },
    onError: (error) => {
      toast.apiError({ error, t, tExists, baseTranslationKey: 'api' });
    },
    onSettled: () => setResendingId(null),
  });

  const { mutateAsync: cancelInvitation } = useProjectsServiceCancelProjectInvitation<
    ProjectsServiceCancelProjectInvitationMutationResult,
    ApiError
  >({
    onSuccess: () => {
      toast.success({ title: t('success.cancel') });
      invalidateInvitations();
    },
    onError: (error) => {
      toast.apiError({ error, t, tExists, baseTranslationKey: 'api' });
    },
    onSettled: () => setCancellingId(null),
  });

  if (!isOwner) {
    return null;
  }

  const content = (() => {
    if (isLoading) {
      return (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      );
    }

    if (!pendingInvitations.length) {
      return <p className="text-small text-default-500">{t('sections.pending.empty')}</p>;
    }

    return pendingInvitations.map((invitation) => (
      <PendingInvitationRow
        key={invitation.id}
        invitation={invitation}
        isLoadingResend={resendingId === invitation.id}
        isLoadingCancel={cancellingId === invitation.id}
        onResend={async () => {
          setResendingId(invitation.id);
          await resendInvitation({ id: projectId, invitationId: invitation.id });
        }}
        onCancel={async () => {
          setCancellingId(invitation.id);
          await cancelInvitation({ id: projectId, invitationId: invitation.id });
        }}
      />
    ));
  })();

  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-4">
        <p className="text-large font-semibold">{t('sections.pending.title')}</p>
        <Chip size="sm" variant="flat">
          {pendingInvitations.length}
        </Chip>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">{content}</div>
      </CardContent>
    </Card>
  );
}

type PendingInvitationRowProps = {
  invitation: ProjectInvitation;
  isLoadingResend: boolean;
  isLoadingCancel: boolean;
  onResend: () => Promise<void>;
  onCancel: () => Promise<void>;
};

const statusColor: Record<ProjectInvitation['status'], 'default' | 'success' | 'warning' | 'danger'> = {
  pending: 'warning',
  accepted: 'success',
  declined: 'danger',
  canceled: 'default',
};

function PendingInvitationRow(props: Readonly<PendingInvitationRowProps>) {
  const { invitation, isLoadingResend, isLoadingCancel, onCancel, onResend } = props;
  const { t } = useTranslations({ en, de });

  return (
    <div className="flex flex-col gap-2 rounded-medium border border-default-200 p-3">
      <div className="flex items-center justify-between gap-3">
        <AttraccessUser user={invitation.invitedUser} />
        <Chip size="sm" color={statusColor[invitation.status]} variant="flat">
          {t(`statuses.${invitation.status}` as const)}
        </Chip>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-small text-default-500">
        <span>
          {t(`roles.${invitation.requestedRole}` as const)} · {new Date(invitation.createdAt).toLocaleString()}
        </span>
        {invitation.inviter && <span>{invitation.inviter.username}</span>}
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button
          size="sm"
          variant="light"
          startContent={<RefreshCcwIcon className="size-4" />}
          isLoading={isLoadingResend}
          onPress={onResend}
        >
          {t('actions.resend')}
        </Button>
        <Button
          size="sm"
          variant="light"
          color="danger"
          startContent={<XIcon className="size-4" />}
          isLoading={isLoadingCancel}
          onPress={onCancel}
        >
          {t('actions.cancel')}
        </Button>
      </div>
    </div>
  );
}
