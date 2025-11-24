import { useCallback, useMemo, useState } from 'react';
import { Button, Card, CardBody, CardHeader, Chip, Skeleton } from '@heroui/react';
import {
  ApiError,
  ProjectsServiceRemoveProjectMemberMutationResult,
  UseProjectsServiceListProjectMembersKeyFn,
  useProjectsServiceListProjectMembers,
  useProjectsServiceRemoveProjectMember,
} from '@attraccess/react-query-client';
import { AttraccessUser, useTranslations } from '@attraccess/plugins-frontend-ui';
import { UserMinus2Icon } from 'lucide-react';
import { useToastMessage } from '../../../../../components/toastProvider';
import { useQueryClient } from '@tanstack/react-query';
import API_ERROR_TRANSLATIONS_EN from '../../../../../global-translations/api-errors.en.json';
import API_ERROR_TRANSLATIONS_DE from '../../../../../global-translations/api-errors.de.json';
import en from './en.json';
import de from './de.json';

type TeamMembersCardProps = {
  projectId: number;
  isOwner: boolean;
};

export function TeamMembersCard(props: Readonly<TeamMembersCardProps>) {
  const { projectId, isOwner } = props;
  const toast = useToastMessage();
  const queryClient = useQueryClient();
  const [removingMemberId, setRemovingMemberId] = useState<number | null>(null);

  const { t, tExists } = useTranslations({
    en: { ...en, api: API_ERROR_TRANSLATIONS_EN },
    de: { ...de, api: API_ERROR_TRANSLATIONS_DE },
  });

  const { data, isLoading } = useProjectsServiceListProjectMembers({ id: projectId }, undefined, {
    enabled: isOwner,
  });

  const members = useMemo(() => data?.members ?? [], [data?.members]);

  const invalidateMembers = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: UseProjectsServiceListProjectMembersKeyFn({ id: projectId }),
    });
  }, [projectId, queryClient]);

  const { mutateAsync: removeMember } = useProjectsServiceRemoveProjectMember<
    ProjectsServiceRemoveProjectMemberMutationResult,
    ApiError
  >({
    onSuccess: () => {
      toast.success({ title: t('success.remove') });
      invalidateMembers();
    },
    onError: (error) => {
      toast.apiError({ error, t, tExists, baseTranslationKey: 'api' });
    },
    onSettled: () => {
      setRemovingMemberId(null);
    },
  });

  const memberRows = useMemo(() => {
    if (isLoading) {
      return (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      );
    }

    if (!members.length) {
      return <p className="text-small text-default-500">{t('sections.members.empty')}</p>;
    }

    return members.map((member) => (
      <div
        key={member.id}
        className="flex items-center justify-between gap-3 rounded-medium border border-default-200 p-3"
      >
        <AttraccessUser user={member.user} />
        <div className="flex items-center gap-2">
          <Chip size="sm" variant="flat">
            {t(`roles.${member.role}` as const)}
          </Chip>
          <Button
            color="danger"
            size="sm"
            variant="light"
            isIconOnly
            aria-label={t('actions.remove')}
            isLoading={removingMemberId === member.id}
            onPress={async () => {
              setRemovingMemberId(member.id);
              await removeMember({ id: projectId, memberId: member.id });
            }}
          >
            <UserMinus2Icon className="size-4" />
          </Button>
        </div>
      </div>
    ));
  }, [isLoading, members, projectId, removeMember, removingMemberId, t]);

  if (!isOwner) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <p className="text-large font-semibold">{t('sections.members.title')}</p>
      </CardHeader>
      <CardBody className="space-y-4">
        <div className="flex items-center justify-between gap-4 rounded-medium border border-default-200 p-3">
          {data?.owner ? <AttraccessUser user={data.owner} /> : <Skeleton className="h-10 w-full" />}
          <Chip size="sm" color="primary" variant="flat">
            {t('owner')}
          </Chip>
        </div>
        <div className="space-y-3">{memberRows}</div>
      </CardBody>
    </Card>
  );
}
