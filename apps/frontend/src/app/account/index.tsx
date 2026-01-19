import { PageHeader } from '../../components/pageHeader';
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
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import { UsernameForm } from './username';
import { SetPasswordForm } from '../user-management/details/components/setPasswordForm';
import { useAuth } from '../../hooks/useAuth';
import { useUsersServiceRequestDeleteAccount, ApiError } from '@attraccess/react-query-client';
import { useToastMessage } from '../../components/toastProvider';
import API_ERROR_TRANSLATIONS_EN from '../../global-translations/api-errors.en.json';
import API_ERROR_TRANSLATIONS_DE from '../../global-translations/api-errors.de.json';

export default function AccountPage() {
  const { t, tExists } = useTranslations({
    en: { ...en, apiErrors: API_ERROR_TRANSLATIONS_EN },
    de: { ...de, apiErrors: API_ERROR_TRANSLATIONS_DE },
  });

  const { user: me } = useAuth();
  const toast = useToastMessage();
  const { isOpen, onOpen, onClose } = useDisclosure();

  const { mutate: requestDelete, isPending: isRequestingDelete } = useUsersServiceRequestDeleteAccount({
    onSuccess: () => {
      toast.success({
        title: t('deleteAccount.toast.title'),
        description: t('deleteAccount.toast.description'),
      });
      onClose();
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
      <PageHeader title={t('title')} backTo="/" />

      <div className="flex flex-row flex-wrap gap-4">
        <Card className="max-w-md">
          <CardHeader>
            <PageHeader title={t('sections.profile')} noMargin />
          </CardHeader>
          <CardBody className="flex flex-col gap-2">
            <UsernameForm />
          </CardBody>
        </Card>

        <Card className="max-w-md">
          <CardHeader>
            <PageHeader title={t('sections.security')} noMargin />
          </CardHeader>
          <CardBody className="flex flex-col gap-2">{me && <SetPasswordForm userId={me.id} />} </CardBody>
        </Card>

        <Card className="max-w-md">
          <CardHeader>
            <PageHeader title={t('sections.dangerZone')} noMargin />
          </CardHeader>
          <CardBody className="flex flex-col gap-4">
            <p className="text-sm text-default-500">{t('deleteAccount.description')}</p>
            <Button color="danger" variant="flat" onPress={onOpen} data-cy="delete-account-open-modal">
              {t('deleteAccount.actions.request')}
            </Button>
          </CardBody>
        </Card>
      </div>

      <Modal isOpen={isOpen} onOpenChange={(open) => (open ? onOpen() : onClose())}>
        <ModalContent>
          {() => (
            <>
              <ModalHeader>{t('deleteAccount.modal.title')}</ModalHeader>
              <ModalBody>
                <p className="text-sm text-default-500">{t('deleteAccount.modal.description')}</p>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose} isDisabled={isRequestingDelete}>
                  {t('deleteAccount.actions.cancel')}
                </Button>
                <Button
                  color="danger"
                  onPress={() => requestDelete()}
                  isLoading={isRequestingDelete}
                  data-cy="delete-account-confirm-button"
                >
                  {t('deleteAccount.actions.confirm')}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
