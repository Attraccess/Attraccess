import { ApiError, useUsersServiceDeleteUser, useUsersServiceGetOneUserById } from '@attraccess/react-query-client';
import { PageHeader } from '../../../components/pageHeader';
import { useNavigate, useParams } from 'react-router-dom';
import { UserPermissionForm } from './components/permissionsForm';
import { SetPasswordForm } from './components/setPasswordForm';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { ChangeUsernameForm } from './components/changeUsername';
import { ChangeEmailForm } from './components/changeEmail';

import en from './en.json';
import de from './de.json';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  useDisclosure,
} from '@heroui/react';
import { useToastMessage } from '../../../components/toastProvider';
import API_ERROR_TRANSLATIONS_EN from '../../../global-translations/api-errors.en.json';
import API_ERROR_TRANSLATIONS_DE from '../../../global-translations/api-errors.de.json';
import { useAuth } from '../../../hooks/useAuth';

export function UserManagementDetailsPage() {
  const { id: idParam } = useParams<{ id: string }>();

  const { t, tExists } = useTranslations({
    en: { ...en, apiErrors: API_ERROR_TRANSLATIONS_EN },
    de: { ...de, apiErrors: API_ERROR_TRANSLATIONS_DE },
  });

  const navigate = useNavigate();
  const toast = useToastMessage();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { user: me } = useAuth();

  const id = parseInt(idParam || '', 10);

  const { data: user } = useUsersServiceGetOneUserById({ id });

  const isSelf = !!me && !!user && me.id === user.id;
  const { mutate: deleteUser, isPending: isDeleting } = useUsersServiceDeleteUser({
    onSuccess: () => {
      toast.success({
        title: t('delete.success.title'),
        description: t('delete.success.description', { username: user?.username ?? '' }),
      });
      navigate('/users');
    },
    onError: (error) => {
      toast.apiError({
        error: error as ApiError,
        t,
        tExists,
        baseTranslationKey: 'apiErrors',
      });
    },
  });

  return (
    <div>
      <PageHeader
        title={`${user?.username ?? ''} (ID: ${user?.id ?? ''})`}
        subtitle={t('details.externalIdentifier', { identifier: user?.externalIdentifier })}
        backTo="/users"
      />

      <div className="flex flex-row flex-wrap gap-4">
        {user && (
          <>
            <UserPermissionForm user={user} />{' '}
            <Card>
              <CardHeader>
                <PageHeader title={t('profile.title')} noMargin />
              </CardHeader>
              <CardBody className="flex flex-col gap-8">
                <ChangeUsernameForm userId={user.id} />
                <ChangeEmailForm userId={user.id} />
                <SetPasswordForm userId={user.id} />
              </CardBody>
            </Card>

            <Card className="max-w-md">
              <CardHeader>
                <PageHeader title={t('delete.title')} noMargin />
              </CardHeader>
              <CardBody className="flex flex-col gap-4">
                <p className="text-sm text-default-500">{t('delete.description')}</p>
                <Button
                  color="danger"
                  variant="flat"
                  onPress={onOpen}
                  isDisabled={isSelf}
                  data-cy="admin-delete-user-open-modal"
                >
                  {t('delete.actions.open')}
                </Button>
                {isSelf ? <p className="text-xs text-default-400">{t('delete.selfDisabled')}</p> : null}
              </CardBody>
            </Card>
          </>
        )}
      </div>

      <Modal isOpen={isOpen} onOpenChange={(open) => (open ? onOpen() : onClose())}>
        <ModalContent>
          {() => (
            <>
              <ModalHeader>{t('delete.modal.title')}</ModalHeader>
              <ModalBody>
                <p className="text-sm text-default-500">{t('delete.modal.description')}</p>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose} isDisabled={isDeleting}>
                  {t('delete.actions.cancel')}
                </Button>
                <Button
                  color="danger"
                  onPress={() => user && deleteUser({ id: user.id })}
                  isLoading={isDeleting}
                  data-cy="admin-delete-user-confirm-button"
                >
                  {t('delete.actions.confirm')}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
