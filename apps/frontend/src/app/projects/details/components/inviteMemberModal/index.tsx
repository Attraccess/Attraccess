import { ReactNode, useCallback, useMemo, useState } from 'react';
import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
  Selection,
  useDisclosure,
} from '@heroui/react';
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
  const { isOpen, onOpen, onClose } = useDisclosure();
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
      onClose();
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

  const onSelectionChange = useCallback(
    (keys: Selection) => {
      const value = Array.from(keys)[0] as ProjectMember['role'] | undefined;
      if (value) {
        setRole(value);
      }
    },
    [setRole],
  );

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
    (open: boolean) => {
      if (!open) {
        resetState();
        onClose();
        return;
      }
      onOpen();
    },
    [onOpen, onClose, resetState],
  );

  return (
    <>
      {children(onOpen)}
      <Modal isOpen={isOpen} onOpenChange={handleOpenChange}>
        <ModalContent>
          {() => (
            <>
              <ModalHeader>{t('title')}</ModalHeader>
              <ModalBody className="gap-4">
                <p className="text-small text-default-500">{t('description')}</p>
                <UserSearch
                  label={t('inputs.user')}
                  onSelectionChange={setSelectedUser}
                  afterSelection={
                    selectedUser ? <span className="text-tiny text-default-500">{selectedUser.username}</span> : null
                  }
                />
                <Select
                  label={t('inputs.role')}
                  selectedKeys={[role]}
                  onSelectionChange={onSelectionChange}
                  disallowEmptySelection
                >
                  {roleOptions.map((value) => (
                    <SelectItem key={value}>{t(`roles.${value}`)}</SelectItem>
                  ))}
                </Select>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={() => onClose()} isDisabled={isPending}>
                  {t('actions.cancel')}
                </Button>
                <Button color="primary" onPress={onInvite} isDisabled={!selectedUser} isLoading={isPending}>
                  {t('actions.invite')}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
}
