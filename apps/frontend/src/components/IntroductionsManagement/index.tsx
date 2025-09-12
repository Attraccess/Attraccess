import { useCallback, useMemo, useState } from 'react';
import {
  Card,
  CardHeader,
  CardBody,
  CardProps,
  useDisclosure,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  Textarea,
  ModalFooter,
  Button,
  Form,
} from '@heroui/react';
import { HistoryIcon, ShieldCheckIcon } from 'lucide-react';
import { ResourceIntroduction, User } from '@attraccess/react-query-client';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import { PageHeader } from '../pageHeader';
import { Action, UserSelectionList } from '../userSelectionList';
import { useHasValidIntroduction } from '../../hooks/useHasValidIntroduction';

interface UserWithIntroductionStatus extends User {
  hasValidIntroduction: boolean;
}

interface IntroductionsManagementProps {
  introductions: ResourceIntroduction[];
  onGrantIntroduction: (data: { user: User; comment?: string }) => void;
  onRevokeIntroduction: (data: { user: User; comment?: string }) => void;
  isGranting: boolean;
  isRevoking: boolean;
  isLoadingIntroductions: boolean;
  onHistoryModalOpen: (props: { user: User; introduction: ResourceIntroduction }) => void;
}

export function IntroductionsManagement(props: Readonly<IntroductionsManagementProps & Omit<CardProps, 'children'>>) {
  const {
    introductions,
    onGrantIntroduction,
    onRevokeIntroduction,
    isGranting,
    isRevoking,
    isLoadingIntroductions,
    onHistoryModalOpen,
    ...rest
  } = props;

  const { t } = useTranslations({ en, de });
  const [comment, setComment] = useState<string | undefined>(undefined);
  const { isOpen: commentModalIsOpen, onOpen: openCommentModal, onClose: closeCommentModal } = useDisclosure();
  const [action, setAction] = useState<'grant' | 'revoke'>('grant');
  const [selectedUser, setSelectedUser] = useState<User | undefined>(undefined);

  const usersWithIntroductions = useMemo(() => {
    return (introductions ?? []).map((introduction) => introduction.receiverUser);
  }, [introductions]);

  const userHasValidIntroduction = useHasValidIntroduction({ introductions });

  const Actions = useMemo(
    () =>
      (user: UserWithIntroductionStatus): Action<UserWithIntroductionStatus>[] => [
        {
          key: 'history',
          onClick: (clickedUser) => {
            const introductionOfUser = (introductions ?? []).find((intro) => intro.receiverUserId === clickedUser.id);

            if (!introductionOfUser) {
              return;
            }

            onHistoryModalOpen({ user: clickedUser, introduction: introductionOfUser });
          },
          isIconOnly: true,
          startContent: <HistoryIcon className="w-4 h-4" />,
        },
        {
          key: 'grant-revoke',
          label: user.hasValidIntroduction ? t('actions.revoke') : t('actions.grant'),
          isLoading: isRevoking ?? isGranting,
          onClick: (user) => {
            setSelectedUser(user);
            setComment(undefined);
            setAction(user.hasValidIntroduction ? 'revoke' : 'grant');
            openCommentModal();
          },
        },
      ],
    [onHistoryModalOpen, isRevoking, isGranting, t, introductions, openCommentModal],
  );

  const userWithIntroductionStatus = useMemo((): UserWithIntroductionStatus[] => {
    return usersWithIntroductions.map((user) => {
      const hasValidIntroduction = userHasValidIntroduction(user);
      return {
        ...user,
        hasValidIntroduction,
      };
    });
  }, [usersWithIntroductions, userHasValidIntroduction]);

  const onCommentModalSubmit = useCallback(() => {
    if (!selectedUser) {
      return;
    }

    if (action === 'grant') {
      onGrantIntroduction({ user: selectedUser, comment: comment ?? undefined });
    } else {
      onRevokeIntroduction({ user: selectedUser, comment: comment ?? undefined });
    }

    closeCommentModal();
  }, [selectedUser, action, comment, onGrantIntroduction, onRevokeIntroduction, closeCommentModal]);

  return (
    <Card {...rest}>
      <CardHeader>
        <PageHeader title={t('title')} subtitle={t('subtitle')} icon={<ShieldCheckIcon />} noMargin={true} />
      </CardHeader>
      <CardBody>
        <UserSelectionList
          selectedUsers={userWithIntroductionStatus}
          onAddToSelection={(user) => onGrantIntroduction({ user })}
          addToSelectionIsLoading={isGranting}
          selectedUserIsLoading={isLoadingIntroductions}
          rowClassName={(user) =>
            user.hasValidIntroduction ? 'border-l-8 border-l-success' : 'border-l-8 border-l-danger'
          }
          tableProps={{
            removeWrapper: true,
            shadow: 'none',
          }}
          actions={Actions}
        />

        <Modal isOpen={commentModalIsOpen} onClose={closeCommentModal}>
          <ModalContent>
            <ModalHeader>{t('commentModal.title')}</ModalHeader>

            <ModalBody>
              <Form
                onSubmit={(e) => {
                  e.preventDefault();
                  onCommentModalSubmit();
                }}
              >
                <Textarea
                  label={t('commentModal.label')}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />

                <button type="submit" hidden />
              </Form>
            </ModalBody>

            <ModalFooter>
              <Button onPress={onCommentModalSubmit}>{t('commentModal.submit')}</Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      </CardBody>
    </Card>
  );
}
