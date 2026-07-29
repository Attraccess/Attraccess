import { ReactNode, useCallback, useMemo, useState } from 'react';
import {
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  useOverlayState,
} from '@heroui/react';
import { Button } from '../../../../../components/button';
import { StandardDrawer } from '../../../../../components/standardDrawer';
import { Select } from '../../../../../components/select';
import { useQueryClient } from '@tanstack/react-query';
import {
  UseProjectsServiceListProjectInvitationsKeyFn,
  UseProjectsServiceListProjectMembersKeyFn,
  useProjectsServiceCreateProjectInvitation,
  User,
  ProjectMember,
  ApiError,
  ProjectMemberRole,
} from '@attraccess/react-query-client';
import { useTranslations, UserSearch } from '@attraccess/plugins-frontend-ui';
import { useToastMessage } from '../../../../../components/toastProvider';
import API_ERROR_TRANSLATIONS_EN from '../../../../../global-translations/api-errors.en.json';
import API_ERROR_TRANSLATIONS_DE from '../../../../../global-translations/api-errors.de.json';
import en from './en.json';
import de from './de.json';

type InviteProjectMemberModalProps = {
  projectId: number;
  children: (onOpen: () => void) => ReactNode;
};

export function InviteProjectMemberModal(props: Readonly<InviteProjectMemberModalProps>) {
  const { projectId, children } = props;
  const { isOpen, open, close } = useOverlayState();
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [role, setRole] = useState<ProjectMember['role']>(ProjectMemberRole.VIEWER);
  const queryClient = useQueryClient();
  const toast = useToastMessage();
  const { t, tExists } = useTranslations({
    en: { ...en, api: API_ERROR_TRANSLATIONS_EN },
    de: { ...de, api: API_ERROR_TRANSLATIONS_DE },
  });

  const resetState = useCallback(() => {
    setSelectedUser(null);
    setRole(ProjectMemberRole.VIEWER);
  }, []);

  const invalidateCollaboratorQueries = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: UseProjectsServiceListProjectMembersKeyFn({ id: projectId }),
      }),
      queryClient.invalidateQueries({
        queryKey: UseProjectsServiceListProjectInvitationsKeyFn({ id: projectId }),
      }),
    ]);
  }, [projectId, queryClient]);

  const { mutateAsync: createInvitation, isPending } = useProjectsServiceCreateProjectInvitation({
    onSuccess: (invitation) => {
      toast.success({
        title: t('success.title'),
        description: t('success.description', { username: invitation.invitedUser?.username ?? '' }),
      });
      invalidateCollaboratorQueries();
      close();
      resetState();
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

  const roleOptions = useMemo(() => Object.values(ProjectMemberRole), []);

  const onInvite = useCallback(async () => {
    if (!selectedUser) {
      return;
    }
    await createInvitation({
      id: projectId,
      requestBody: { invitedUserId: selectedUser.id, role },
    });
  }, [createInvitation, projectId, role, selectedUser]);

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        resetState();
        close();
        return;
      }
      open();
    },
    [open, close, resetState],
  );

  return (
    <>
      {children(open)}
      <StandardDrawer isOpen={isOpen} onOpenChange={handleOpenChange}>
        <DrawerHeader>
          <h2 className="text-lg font-semibold">{t('title')}</h2>
        </DrawerHeader>
        <DrawerBody className="flex flex-col gap-4">
          <p className="text-small text-default-500">{t('description')}</p>
          <UserSearch
            resetSignal={isOpen}
            label={t('inputs.user')}
            onSelectionChange={setSelectedUser}
            afterSelection={
              selectedUser ? (
                <span className="text-tiny text-default-500">{selectedUser.username}</span>
              ) : null
            }
          />
          <Select
            label={t('inputs.role')}
            value={role}
            onChange={(key) => {
              if (key) setRole(key as ProjectMember['role']);
            }}
            items={roleOptions.map((value) => ({ key: value, label: t(`roles.${value}`) }))}
          />
        </DrawerBody>
        <DrawerFooter>
          <Button variant="ghost" onPress={() => handleOpenChange(false)} isDisabled={isPending}>
            {t('actions.cancel')}
          </Button>
          <Button variant="primary" onPress={onInvite} isDisabled={!selectedUser} isPending={isPending}>
            {t('actions.invite')}
          </Button>
        </DrawerFooter>
      </StandardDrawer>
    </>
  );
}
